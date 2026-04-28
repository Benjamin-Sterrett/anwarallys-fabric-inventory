// Folder reads + writes. `deletedAt == null` skips tombstones.

import { FirebaseError } from 'firebase/app';
import {
  addDoc,
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore';
import { getDb } from '@/lib/firebase/app';
import { folderConverter, itemConverter } from '@/lib/firebase/converters';
import type { Folder } from '@/lib/models';
import { err, ok, type Result } from './result';

function isNonEmpty(s: unknown): s is string {
  return typeof s === 'string' && s.trim() !== '';
}

// Two-try pattern: init failures (`getDb()` throwing — IndexedDB disabled,
// storage quota) map to `firestore/init-failed`; operational failures
// (`permission-denied`, `failed-precondition`, `unavailable`, etc.) preserve
// the SDK's `FirebaseError.code` so callers can distinguish authz problems
// from genuine init failures.

/**
 * Immediate children of a folder. Pass `null` for root-level (Rooms).
 * Errors: `firestore/no-db`, `firestore/init-failed`,
 * `firestore/<FirestoreErrorCode>` (e.g. `firestore/permission-denied`,
 * `firestore/unavailable`), `firestore/unknown`.
 */
export async function listFolderChildren(parentId: string | null): Promise<Result<Folder[]>> {
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
      collection(db, 'folders').withConverter(folderConverter),
      where('parentId', '==', parentId),
      where('deletedAt', '==', null),
    );
    const snap = await getDocs(q);
    return ok(snap.docs.map((d) => d.data()));
  } catch (e: unknown) {
    if (e instanceof FirebaseError) return err(`firestore/${e.code}`, e.message);
    return err('firestore/unknown', e instanceof Error ? e.message : String(e));
  }
}

/**
 * Live subscription to a folder's immediate children. `null` = root.
 * Returns an SDK `Unsubscribe`; caller MUST invoke on cleanup. On
 * `getDb()` failure the returned unsubscribe is a no-op and `onError`
 * fires once on the next microtask. Errors via `onError`:
 * `firestore/no-db`, `firestore/init-failed`,
 * `firestore/<FirestoreErrorCode>`.
 */
export function subscribeToFolderChildren(
  parentId: string | null,
  onNext: (folders: Folder[]) => void,
  onError: (error: { code: string; message: string }) => void,
): Unsubscribe {
  let db: Firestore;
  try {
    const maybeDb = getDb();
    if (!maybeDb) {
      queueMicrotask(() =>
        onError({ code: 'firestore/no-db', message: 'Firebase is not configured.' }),
      );
      return () => undefined;
    }
    db = maybeDb;
  } catch (e: unknown) {
    queueMicrotask(() =>
      onError({
        code: 'firestore/init-failed',
        message: e instanceof Error ? e.message : String(e),
      }),
    );
    return () => undefined;
  }

  const q = query(
    collection(db, 'folders').withConverter(folderConverter),
    where('parentId', '==', parentId),
    where('deletedAt', '==', null),
  );
  return onSnapshot(q, {
    next: (snap) => onNext(snap.docs.map((d) => d.data())),
    // The SDK types `error` as `FirestoreError`, so `code`/`message` are
    // always present here (no `unknown` widening needed).
    error: (e) => onError({ code: `firestore/${e.code}`, message: e.message }),
  });
}

/**
 * Single folder by ID. `null` when missing.
 * Errors: `firestore/no-db`, `firestore/init-failed`,
 * `firestore/<FirestoreErrorCode>`, `firestore/unknown`.
 */
export async function getFolderById(folderId: string): Promise<Result<Folder | null>> {
  if (!isNonEmpty(folderId)) return err('invalid-input', 'folderId is required.');

  let db: Firestore;
  try {
    const maybeDb = getDb();
    if (!maybeDb) return err('firestore/no-db', 'Firebase is not configured.');
    db = maybeDb;
  } catch (e: unknown) {
    return err('firestore/init-failed', e instanceof Error ? e.message : String(e));
  }

  try {
    const ref = doc(db, 'folders', folderId).withConverter(folderConverter);
    const snap = await getDoc(ref);
    if (!snap.exists()) return ok(null);
    return ok(snap.data());
  } catch (e: unknown) {
    if (e instanceof FirebaseError) return err(`firestore/${e.code}`, e.message);
    return err('firestore/unknown', e instanceof Error ? e.message : String(e));
  }
}

/**
 * Create-folder parameters. No `actorName` by design: the `Folder`
 * schema has no field for it and rules don't read one for folder writes
 * (movements is where we denormalize names). `parentDepth`/`parentAncestors`
 * come from the caller's loaded parent — both must be `null`/`[]` for
 * root creates. Rules enforce derived `depth` + `ancestors` server-side.
 */
export interface CreateFolderParams {
  name: string;
  parentId: string | null;
  parentAncestors: string[];
  parentDepth: number | null;
  actorUid: string;
}

/**
 * Create a folder. Root when `parentId === null` (and `parentDepth` /
 * `parentAncestors` empty). Errors: `invalid-input`, `firestore/no-db`,
 * `firestore/init-failed`, `firestore/<FirestoreErrorCode>`,
 * `firestore/unknown`.
 */
export async function createFolder(
  params: CreateFolderParams,
): Promise<Result<{ folderId: string }>> {
  const trimmedName = typeof params.name === 'string' ? params.name.trim() : '';
  if (trimmedName === '') return err('invalid-input', 'name is required.');
  if (!isNonEmpty(params.actorUid)) return err('invalid-input', 'actorUid is required.');

  const isRoot = params.parentId === null;
  if (isRoot && params.parentDepth !== null) {
    return err('invalid-input', 'root create requires parentDepth=null.');
  }
  if (!isRoot && (typeof params.parentDepth !== 'number' || params.parentDepth < 0)) {
    return err('invalid-input', 'non-root create requires non-negative parentDepth.');
  }
  if (isRoot && params.parentAncestors.length !== 0) {
    return err('invalid-input', 'root create requires empty parentAncestors.');
  }

  let db: Firestore;
  try {
    const maybeDb = getDb();
    if (!maybeDb) return err('firestore/no-db', 'Firebase is not configured.');
    db = maybeDb;
  } catch (e: unknown) {
    return err('firestore/init-failed', e instanceof Error ? e.message : String(e));
  }

  try {
    const ancestors = isRoot ? [] : [...params.parentAncestors, params.parentId as string];
    const depth = isRoot ? 0 : (params.parentDepth as number) + 1;
    const ref = await addDoc(
      collection(db, 'folders').withConverter(folderConverter),
      {
        // folderId is stripped by the converter on write.
        folderId: '',
        name: trimmedName,
        parentId: params.parentId,
        ancestors,
        depth,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: params.actorUid,
        updatedBy: params.actorUid,
        // PRJ-865: explicit null required (rules' hasAll guard).
        deletedAt: null,
        deletedBy: null,
        deleteReason: null,
      },
    );
    return ok({ folderId: ref.id });
  } catch (e: unknown) {
    if (e instanceof FirebaseError) return err(`firestore/${e.code}`, e.message);
    return err('firestore/unknown', e instanceof Error ? e.message : String(e));
  }
}

/**
 * Active items in `folderId`'s subtree (via denormalized `folderAncestors`).
 * Errors: `firestore/no-db`, `firestore/init-failed`,
 * `firestore/<FirestoreErrorCode>`, `firestore/unknown`.
 */
export async function countActiveItemsInSubtree(folderId: string): Promise<Result<number>> {
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
      collection(db, 'items').withConverter(itemConverter),
      where('folderAncestors', 'array-contains', folderId),
      where('deletedAt', '==', null),
    );
    const snap = await getCountFromServer(q);
    return ok(snap.data().count);
  } catch (e: unknown) {
    if (e instanceof FirebaseError) return err(`firestore/${e.code}`, e.message);
    return err('firestore/unknown', e instanceof Error ? e.message : String(e));
  }
}

/**
 * Live subscription to ALL folders (active and deleted). Used by the
 * /deleted view to resolve folder names for breadcrumb paths (PRJ-923).
 * Returns an SDK `Unsubscribe`; caller MUST invoke on cleanup.
 */
export function subscribeToAllFolders(
  onNext: (folders: Folder[]) => void,
  onError: (error: { code: string; message: string }) => void,
): Unsubscribe {
  let db: Firestore;
  try {
    const maybeDb = getDb();
    if (!maybeDb) {
      queueMicrotask(() =>
        onError({ code: 'firestore/no-db', message: 'Firebase is not configured.' }),
      );
      return () => undefined;
    }
    db = maybeDb;
  } catch (e: unknown) {
    queueMicrotask(() =>
      onError({
        code: 'firestore/init-failed',
        message: e instanceof Error ? e.message : String(e),
      }),
    );
    return () => undefined;
  }

  const q = query(collection(db, 'folders').withConverter(folderConverter));
  return onSnapshot(q, {
    next: (snap) => onNext(snap.docs.map((d) => d.data())),
    error: (e) => onError({ code: `firestore/${e.code}`, message: e.message }),
  });
}
