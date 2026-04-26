// Staff/admin user reads + writes (PRJ-856). All wrappers go through
// `getDb()` and return `Result<T>`. Init failures map to
// `firestore/no-db` / `firestore/init-failed`; operational failures
// preserve the SDK's `FirebaseError.code` (folders.ts/movements.ts pattern).
//
// `createStaffUser` provisioning model:
//   - TRANSIENT secondary Firebase app + Auth instance (inMemoryPersistence)
//     so `createUserWithEmailAndPassword` does NOT replace the admin's
//     primary session. `deleteApp` in `finally` prevents instance leaks.
//   - On Firestore-write failure, compensating-delete the just-created
//     Auth account ONLY when the Firestore error code is in
//     ROLLBACKABLE_FIRESTORE_CODES (definitive pre-write rejection).
//     Ambiguous codes (`unavailable`, `aborted`, etc.) could mean the
//     write IS persisted server-side; rolling back then would create the
//     inverse orphan (live /users doc, deleted Auth account).
//   - On ambiguous Auth-create rejection (network/timeout/internal/unknown),
//     surface "verify in Firebase Console" — the account may exist server
//     side and a blind retry would hit `auth/email-already-in-use`.
// Caller surfaces orphan paths to admin for Firebase Console reconciliation.

import { FirebaseError, deleteApp, initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  deleteUser,
  inMemoryPersistence,
  initializeAuth,
  updateProfile,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Firestore,
} from 'firebase/firestore';
import { getDb, getFirebaseApp } from '@/lib/firebase/app';
import { userConverter } from '@/lib/firebase/converters';
import type { User } from '@/lib/models';
import { err, ok, type Result } from './result';

function isNonEmpty(s: unknown): s is string {
  return typeof s === 'string' && s.trim() !== '';
}

/** Firestore codes that guarantee no server-side write — safe to roll back Auth. */
const ROLLBACKABLE_FIRESTORE_CODES = new Set([
  'firestore/permission-denied',
  'firestore/invalid-argument',
  'firestore/unauthenticated',
  'firestore/not-found',
  'firestore/failed-precondition',
]);

/**
 * All active staff (`isActive == true`). Returns `Result<User[]>`.
 * Errors: `firestore/no-db`, `firestore/init-failed`,
 * `firestore/<FirestoreErrorCode>` (e.g. `firestore/permission-denied`),
 * `firestore/unknown`.
 */
export async function listActiveStaff(): Promise<Result<User[]>> {
  let db: Firestore;
  try {
    const maybeDb = getDb();
    if (!maybeDb) return err('firestore/no-db', 'Firebase is not configured.');
    db = maybeDb;
  } catch (e: unknown) {
    return err('firestore/init-failed', e instanceof Error ? e.message : String(e));
  }

  try {
    const q = query(
      collection(db, 'users').withConverter(userConverter),
      where('isActive', '==', true),
    );
    const snap = await getDocs(q);
    return ok(snap.docs.map((d) => d.data()));
  } catch (e: unknown) {
    if (e instanceof FirebaseError) return err(`firestore/${e.code}`, e.message);
    return err('firestore/unknown', e instanceof Error ? e.message : String(e));
  }
}

/**
 * Single user by UID. `Result<null>` when missing.
 * Errors: `firestore/no-db`, `firestore/init-failed`,
 * `firestore/<FirestoreErrorCode>`, `firestore/unknown`.
 */
export async function getUserByUid(uid: string): Promise<Result<User | null>> {
  if (!isNonEmpty(uid)) return err('invalid-input', 'uid is required.');

  let db: Firestore;
  try {
    const maybeDb = getDb();
    if (!maybeDb) return err('firestore/no-db', 'Firebase is not configured.');
    db = maybeDb;
  } catch (e: unknown) {
    return err('firestore/init-failed', e instanceof Error ? e.message : String(e));
  }

  try {
    const ref = doc(db, 'users', uid).withConverter(userConverter);
    const snap = await getDoc(ref);
    if (!snap.exists()) return ok(null);
    return ok(snap.data());
  } catch (e: unknown) {
    if (e instanceof FirebaseError) return err(`firestore/${e.code}`, e.message);
    return err('firestore/unknown', e instanceof Error ? e.message : String(e));
  }
}

export interface CreateStaffUserParams {
  email: string;
  password: string;
  displayName: string;
  /** Admin's UID — written to `createdBy` / `updatedBy`. Rules require it match `request.auth.uid`. */
  adminUid: string;
}

/**
 * Provision a new staff user: Auth account on a TRANSIENT secondary Auth
 * instance, then `/users/{uid}` Firestore doc from the primary db.
 * Errors: `invalid-input`, `firestore/no-db`, `firestore/init-failed`,
 * `auth/<FirebaseAuthErrorCode>` (e.g. `auth/email-already-in-use`),
 * `firestore/<FirestoreErrorCode>`, `firestore/unknown`.
 * See header for orphan-account handling on partial failure.
 */
export async function createStaffUser(
  params: CreateStaffUserParams,
): Promise<Result<{ uid: string }>> {
  if (!isNonEmpty(params.email)) return err('invalid-input', 'email is required.');
  if (!isNonEmpty(params.displayName)) return err('invalid-input', 'displayName is required.');
  if (!isNonEmpty(params.adminUid)) return err('invalid-input', 'adminUid is required.');
  // Firebase Auth's default minimum is 6 chars; surface this at the boundary
  // so the UI doesn't have to round-trip a generic auth/weak-password error.
  if (typeof params.password !== 'string' || params.password.length < 6) {
    return err('invalid-input', 'password must be at least 6 characters.');
  }

  // Read the primary app first — we need its config to spin up a sibling
  // app pointed at the same Firebase project.
  const primaryApp = getFirebaseApp();
  if (!primaryApp) return err('firestore/no-db', 'Firebase is not configured.');

  let db: Firestore;
  try {
    const maybeDb = getDb();
    if (!maybeDb) return err('firestore/no-db', 'Firebase is not configured.');
    db = maybeDb;
  } catch (e: unknown) {
    return err('firestore/init-failed', e instanceof Error ? e.message : String(e));
  }

  // Spin up a uniquely-named secondary app. `Date.now() + Math.random()`
  // guards against name collision under React StrictMode double-invoke and
  // any rapid-fire concurrent calls.
  const secondaryName = `staff-creation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const secondaryApp = initializeApp(primaryApp.options, secondaryName);

  try {
    const secondaryAuth = initializeAuth(secondaryApp, { persistence: inMemoryPersistence });

    let newUid: string;
    let cred: import('firebase/auth').UserCredential;
    try {
      cred = await createUserWithEmailAndPassword(
        secondaryAuth,
        params.email.trim(),
        params.password,
      );
      newUid = cred.user.uid;
      try {
        await updateProfile(cred.user, { displayName: params.displayName.trim() });
      } catch (profileErr: unknown) {
        // Fail-closed: Auth displayName is required. Delete orphan and surface error.
        // Retry may hit email-already-in-use if createUser succeeded server-side.
        const profileMessage = profileErr instanceof Error ? profileErr.message : String(profileErr);
        try {
          await deleteUser(cred.user);
        } catch {
          // Ignore rollback failure — orphan will be visible in Firebase Console.
        }
        return err(
          'auth/profile-update-failed',
          `${profileMessage} (Auth displayName could not be set. Account rolled back. Retry may hit email-already-in-use if the user was created server-side.)`,
        );
      }
    } catch (e: unknown) {
      // Only createUserWithEmailAndPassword failures reach here.
      // Auth network/timeout errors leave the account state UNKNOWN; admin
      // must verify in Firebase Console before retrying (a blind retry
      // would hit `auth/email-already-in-use` on an orphan).
      const code =
        e instanceof FirebaseError
          ? `auth/${e.code.replace(/^auth\//, '')}`
          : 'auth/unknown';
      const message = e instanceof Error ? e.message : String(e);
      const isAmbiguous =
        code === 'auth/network-request-failed' ||
        code === 'auth/timeout' ||
        code === 'auth/internal-error' ||
        code === 'auth/unknown';
      if (isAmbiguous) {
        return err(
          code,
          `${message} (Account state unknown. Verify in Firebase Console before retrying — a stale Auth account would block re-creation.)`,
        );
      }
      return err(code, message);
    }

    try {
      const ref = doc(db, 'users', newUid).withConverter(userConverter);
      await setDoc(ref, {
        uid: newUid,
        email: params.email.trim(),
        displayName: params.displayName.trim(),
        isActive: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: params.adminUid,
        updatedBy: params.adminUid,
      });
      return ok({ uid: newUid });
    } catch (firestoreErr: unknown) {
      // Rollback Auth ONLY for definitive no-write codes (see allow-list).
      // Ambiguous codes leave the /users doc state unknown — wiping Auth
      // then would create the inverse orphan.
      const fsCode =
        firestoreErr instanceof FirebaseError
          ? `firestore/${firestoreErr.code}`
          : 'firestore/unknown';
      const fsMessage =
        firestoreErr instanceof Error ? firestoreErr.message : String(firestoreErr);
      const signedInUser = secondaryAuth.currentUser;
      if (signedInUser && ROLLBACKABLE_FIRESTORE_CODES.has(fsCode)) {
        try {
          await deleteUser(signedInUser);
          return err(fsCode, `${fsMessage} (Auth account rolled back.)`);
        } catch (rollbackErr: unknown) {
          const rbMessage =
            rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr);
          return err(
            fsCode,
            `${fsMessage} (Auth rollback also failed: ${rbMessage}. Delete the orphan Auth user via Firebase Console.)`,
          );
        }
      }
      return err(
        fsCode,
        `${fsMessage} (Auth account may exist; /users doc state unknown. Verify in Firebase Console.)`,
      );
    }
  } finally {
    // Always tear down. `deleteApp` rejects only if the app is already
    // deleted; we swallow because there's no recoverable action.
    try {
      await deleteApp(secondaryApp);
    } catch {
      // Intentionally ignored — secondary app cleanup is best-effort.
    }
  }
}

/**
 * Rename a staff member's `displayName`. Existing movements keep the old
 * name (denormalized at write time per schema); new movements use the new
 * name.
 *
 * Errors: `invalid-input`, `firestore/no-db`, `firestore/init-failed`,
 * `firestore/<FirestoreErrorCode>`, `firestore/unknown`.
 */
export async function renameStaffUser(
  uid: string,
  newDisplayName: string,
  adminUid: string,
): Promise<Result<void>> {
  if (!isNonEmpty(uid)) return err('invalid-input', 'uid is required.');
  if (!isNonEmpty(newDisplayName)) return err('invalid-input', 'newDisplayName is required.');
  if (!isNonEmpty(adminUid)) return err('invalid-input', 'adminUid is required.');

  let db: Firestore;
  try {
    const maybeDb = getDb();
    if (!maybeDb) return err('firestore/no-db', 'Firebase is not configured.');
    db = maybeDb;
  } catch (e: unknown) {
    return err('firestore/init-failed', e instanceof Error ? e.message : String(e));
  }

  try {
    const ref = doc(db, 'users', uid).withConverter(userConverter);
    // Auth displayName is intentionally NOT updated here: the Firebase client
    // SDK cannot update another user's Auth profile. AuthBar uses Firestore
    // `/users/{uid}.displayName` as the canonical source.
    await updateDoc(ref, {
      displayName: newDisplayName.trim(),
      updatedAt: serverTimestamp(),
      updatedBy: adminUid,
    });
    return ok(undefined);
  } catch (e: unknown) {
    if (e instanceof FirebaseError) return err(`firestore/${e.code}`, e.message);
    return err('firestore/unknown', e instanceof Error ? e.message : String(e));
  }
}

/**
 * All inactive staff (`isActive == false`). Returns `Result<User[]>`.
 * Pairs with `reactivateStaffUser` so a mistakenly-deactivated user can
 * be restored from the in-app Staff page without Firebase Console access.
 * Errors: `firestore/no-db`, `firestore/init-failed`,
 * `firestore/<FirestoreErrorCode>`, `firestore/unknown`.
 */
export async function listInactiveStaff(): Promise<Result<User[]>> {
  let db: Firestore;
  try {
    const maybeDb = getDb();
    if (!maybeDb) return err('firestore/no-db', 'Firebase is not configured.');
    db = maybeDb;
  } catch (e: unknown) {
    return err('firestore/init-failed', e instanceof Error ? e.message : String(e));
  }

  try {
    const q = query(
      collection(db, 'users').withConverter(userConverter),
      where('isActive', '==', false),
    );
    const snap = await getDocs(q);
    return ok(snap.docs.map((d) => d.data()));
  } catch (e: unknown) {
    if (e instanceof FirebaseError) return err(`firestore/${e.code}`, e.message);
    return err('firestore/unknown', e instanceof Error ? e.message : String(e));
  }
}

/**
 * Re-enable a previously deactivated staff member. The reverse of
 * `deactivateStaffUser`. Required so an accidental deactivation is
 * recoverable from the in-app Staff page (Codex round-3 finding).
 * Errors: `invalid-input`, `firestore/no-db`, `firestore/init-failed`,
 * `firestore/<FirestoreErrorCode>`, `firestore/unknown`.
 */
export async function reactivateStaffUser(
  uid: string,
  adminUid: string,
): Promise<Result<void>> {
  if (!isNonEmpty(uid)) return err('invalid-input', 'uid is required.');
  if (!isNonEmpty(adminUid)) return err('invalid-input', 'adminUid is required.');

  let db: Firestore;
  try {
    const maybeDb = getDb();
    if (!maybeDb) return err('firestore/no-db', 'Firebase is not configured.');
    db = maybeDb;
  } catch (e: unknown) {
    return err('firestore/init-failed', e instanceof Error ? e.message : String(e));
  }

  try {
    const ref = doc(db, 'users', uid).withConverter(userConverter);
    await updateDoc(ref, {
      isActive: true,
      updatedAt: serverTimestamp(),
      updatedBy: adminUid,
    });
    return ok(undefined);
  } catch (e: unknown) {
    if (e instanceof FirebaseError) return err(`firestore/${e.code}`, e.message);
    return err('firestore/unknown', e instanceof Error ? e.message : String(e));
  }
}

/**
 * Deactivate a staff member by flipping `isActive` to false. Removed from
 * `listActiveStaff()` immediately; `isActiveStaff()` Rules denies their
 * inventory reads/writes. Auth account remains (client SDK cannot disable
 * other users); admin clears via Console for full revocation.
 *
 * Reversible via `reactivateStaffUser`; deactivated accounts visible via
 * `listInactiveStaff`. Admin gate is `/config/admin.adminEmail`, NOT
 * `/users/{uid}.isActive`, so the admin cannot lock themself out of /staff.
 *
 * Errors: `invalid-input`, `firestore/no-db`, `firestore/init-failed`,
 * `firestore/<FirestoreErrorCode>`, `firestore/unknown`.
 */
export async function deactivateStaffUser(
  uid: string,
  adminUid: string,
): Promise<Result<void>> {
  if (!isNonEmpty(uid)) return err('invalid-input', 'uid is required.');
  if (!isNonEmpty(adminUid)) return err('invalid-input', 'adminUid is required.');

  let db: Firestore;
  try {
    const maybeDb = getDb();
    if (!maybeDb) return err('firestore/no-db', 'Firebase is not configured.');
    db = maybeDb;
  } catch (e: unknown) {
    return err('firestore/init-failed', e instanceof Error ? e.message : String(e));
  }

  try {
    const ref = doc(db, 'users', uid).withConverter(userConverter);
    await updateDoc(ref, {
      isActive: false,
      updatedAt: serverTimestamp(),
      updatedBy: adminUid,
    });
    return ok(undefined);
  } catch (e: unknown) {
    if (e instanceof FirebaseError) return err(`firestore/${e.code}`, e.message);
    return err('firestore/unknown', e instanceof Error ? e.message : String(e));
  }
}
