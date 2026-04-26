// Single entry point for Firebase. Import this module FIRST in any module
// that touches Firestore. Never call `getFirestore()` directly — always
// use `getDb()`. Future ESLint rule (PRJ-842) enforces this mechanically.
//
// `initializeFirestore(app, settings)` MUST run before the first
// `getFirestore(app)` — the latter locks settings to defaults and any
// subsequent `initializeFirestore` throws `failed-precondition`. We
// centralize both calls here, in init order, and expose only `getDb()`.
//
// Firebase web config is client-safe; Rules (PRJ-805) are the authz
// surface. Don't add `firebase-admin` (project invariant: client SDK only).

import {
  initializeApp,
  getApp,
  getApps,
  type FirebaseApp,
} from 'firebase/app';
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';

interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

function readConfig(): FirebaseWebConfig | null {
  const env = import.meta.env;
  const values = {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  };
  const missing = Object.entries(values)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length > 0) {
    // Don't throw — CI builds have no .env.local. Callers handle null.
    // eslint-disable-next-line no-console
    console.warn(
      `[firebase] Missing env vars: ${missing.join(', ')}. Firebase not initialized.`,
    );
    return null;
  }
  return values as FirebaseWebConfig;
}

let cachedApp: FirebaseApp | null = null;
let cachedDb: Firestore | null = null;

export function getFirebaseApp(): FirebaseApp | null {
  if (cachedApp) return cachedApp;
  const config = readConfig();
  if (!config) return null;
  // HMR-safe: under Vite HMR `cachedApp` resets to null. The SDK's own
  // registry (survives module reload) tells us if the default app exists.
  cachedApp = getApps().length > 0 ? getApp() : initializeApp(config);
  return cachedApp;
}

/**
 * The ONLY public Firestore accessor. Returns `null` when config is
 * missing. HMR-safe: catches `failed-precondition` from a re-init and
 * falls back to `getFirestore(app)`.
 */
export function getDb(): Firestore | null {
  if (cachedDb) return cachedDb;
  const app = getFirebaseApp();
  if (!app) return null;
  try {
    cachedDb = initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    });
  } catch {
    // HMR re-eval: `initializeFirestore` throws `failed-precondition`
    // because the SDK already initialized Firestore on this app.
    cachedDb = getFirestore(app);
  }
  return cachedDb;
}

// Named export kept for future modules that want the app eagerly.
export const firebaseConfigPresent = readConfig() !== null;
