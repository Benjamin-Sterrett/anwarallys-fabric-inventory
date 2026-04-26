// Firebase Auth — init surface + base helpers only. Sign-in UX is PRJ-781.
// Persistence: IndexedDB then localStorage; SDK auto-migrates. No
// `popupRedirectResolver` (synthesis §3 forbids redirect providers).

import {
  initializeAuth,
  getAuth as firebaseGetAuth,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  onAuthStateChanged,
  signOut as firebaseSignOut,
  type Auth,
  type User,
  type Unsubscribe,
} from 'firebase/auth';
import { getFirebaseApp } from './app';

let cachedAuth: Auth | null = null;

/**
 * Lazy-init Firebase Auth. Returns `null` when config is missing.
 * HMR-safe: catches `auth/already-initialized` and falls back.
 */
export function getAuth(): Auth | null {
  if (cachedAuth) return cachedAuth;
  const app = getFirebaseApp();
  if (!app) return null;
  try {
    cachedAuth = initializeAuth(app, {
      persistence: [indexedDBLocalPersistence, browserLocalPersistence],
    });
  } catch {
    // Already initialized on this app instance (HMR or duplicate import).
    cachedAuth = firebaseGetAuth(app);
  }
  return cachedAuth;
}

/**
 * Currently signed-in user, or `null`. Early-page-load race: returns
 * `null` before `onAuthStateChanged` fires with the persisted user.
 * Callers gating writes (PRJ-781, PRJ-787) MUST gate on
 * `subscribeToAuthState` resolving non-null — synchronous `null` is not
 * "signed out". Safe for optimistic UI hints.
 */
export function getCurrentUser(): User | null {
  const auth = getAuth();
  return auth?.currentUser ?? null;
}

/**
 * Subscribe to auth state changes. Pass-through to `onAuthStateChanged`.
 * When Firebase isn't configured, emits `null` once and returns a no-op.
 */
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
