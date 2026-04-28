// Firebase Auth — init + base helpers. Sign-in UX is PRJ-781.

import {
  initializeAuth,
  getAuth as firebaseGetAuth,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  type Auth,
  type User,
  type UserCredential,
  type Unsubscribe,
} from 'firebase/auth';
import { getFirebaseApp } from './app';
import { ok, err } from '@/lib/queries/result';
import type { Result } from '@/lib/queries/result';

let cachedAuth: Auth | null = null;

/**
 * Lazy-init. `null` when unconfigured. HMR-safe (catches
 * `auth/already-initialized`). Persistence: IndexedDB → localStorage,
 * SDK auto-migrates. No redirect providers (synthesis §3).
 */
export function getAuth(): Auth | null {
  if (cachedAuth) return cachedAuth;
  const app = getFirebaseApp();
  if (!app) return null;
  try {
    cachedAuth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] });
  } catch {
    cachedAuth = firebaseGetAuth(app); // already initialized on this app
  }
  return cachedAuth;
}

/**
 * Currently signed-in user, or `null`. Early-page-load race: returns
 * `null` before `onAuthStateChanged` fires with the persisted user.
 * Callers gating writes MUST use `subscribeToAuthState` and wait for a
 * non-null user — synchronous `null` is not "signed out". Safe for
 * optimistic UI hints.
 */
export function getCurrentUser(): User | null {
  const auth = getAuth();
  return auth?.currentUser ?? null;
}

/** Subscribe to auth state. When unconfigured, emits `null` once + no-op unsub. */
export function subscribeToAuthState(cb: (user: User | null) => void): Unsubscribe {
  const auth = getAuth();
  if (!auth) {
    cb(null);
    return () => {};
  }
  return onAuthStateChanged(auth, cb);
}

/** Sign out. No-op when Firebase isn't configured. */
export async function signOut(): Promise<void> {
  const auth = getAuth();
  if (!auth) return;
  await firebaseSignOut(auth);
}

/**
 * Sign in with email + password. Throws on failure — caller catches
 * `FirebaseError` and maps `error.code` to a plain-language message.
 *
 * `getAuth()` returns `null` only when Firebase env config is missing
 * (CI builds, misconfigured deploys). Surface this as a sentinel error
 * so the login form shows a real message instead of silently rejecting.
 */
export async function signIn(email: string, password: string): Promise<UserCredential> {
  const auth = getAuth();
  if (!auth) {
    // Mirrors FirebaseError shape so the login form's error mapper can
    // recognize it; `auth/internal-error` is a real Firebase code that
    // the form maps to "Could not sign in: <message>".
    throw Object.assign(new Error('Firebase is not configured.'), {
      name: 'FirebaseError',
      code: 'auth/internal-error',
    });
  }
  return signInWithEmailAndPassword(auth, email, password);
}

/**
 * Change password for the currently signed-in user.
 * Re-authenticates with the current password before updating.
 */
export async function changePassword(currentPassword: string, newPassword: string): Promise<Result<void>> {
  const auth = getAuth();
  const user = auth?.currentUser;
  if (!user || !user.email) {
    return err('auth/no-user', 'Not signed in.');
  }
  try {
    const credential = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, credential);
    await updatePassword(user, newPassword);
    return ok(undefined);
  } catch (error) {
    if (error instanceof Error && 'code' in error) {
      const code = (error as { code: string }).code;
      switch (code) {
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
          return err('auth/wrong-password', 'Current password is wrong. Try again.');
        case 'auth/weak-password':
          return err('auth/weak-password', 'Password is too weak. Use at least 6 characters.');
        case 'auth/requires-recent-login':
          return err('auth/requires-recent-login', 'Sign out and sign back in, then try again.');
        case 'auth/network-request-failed':
          return err('auth/network-request-failed', "Can't reach the server. Check your internet.");
        default:
          return err(code, error.message);
      }
    }
    return err('auth/unknown', error instanceof Error ? error.message : 'Unknown error.');
  }
}
