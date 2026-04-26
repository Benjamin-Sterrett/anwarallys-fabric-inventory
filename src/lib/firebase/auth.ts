// Firebase Auth — init + base helpers. Sign-in UX is PRJ-781.

import {
  initializeAuth,
  getAuth as firebaseGetAuth,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type Auth,
  type User,
  type UserCredential,
  type Unsubscribe,
} from 'firebase/auth';
import { getFirebaseApp } from './app';

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
