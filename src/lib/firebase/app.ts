// Single Firebase entry point. Use `getDb()` — never `getFirestore()`
// directly (PRJ-842 will enforce). `initializeFirestore` MUST run before
// the first `getFirestore(app)` (the latter locks settings to defaults
// and a later `initializeFirestore` throws `failed-precondition`); both
// live here so callers can't invert the order. No `firebase-admin`.

import {
  initializeApp,
  getApp,
  getApps,
  FirebaseError,
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
    // CI builds have no .env.local — callers handle null.
    // eslint-disable-next-line no-console
    console.warn(`[firebase] Missing env vars: ${missing.join(', ')}. Firebase not initialized.`);
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
  // HMR-safe: SDK registry survives module reload.
  cachedApp = getApps().length > 0 ? getApp() : initializeApp(config);
  return cachedApp;
}

/**
 * The ONLY public Firestore accessor. `null` when config is missing.
 * Catches the SDK's `failed-precondition` (HMR re-eval) and only that —
 * IndexedDB / storage-quota errors propagate so configuration problems
 * surface instead of silently degrading to memory cache.
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
  } catch (e: unknown) {
    // `failed-precondition` is the SDK's HMR-re-eval signal. Anything
    // else (IndexedDB disabled, storage quota) must propagate.
    if (e instanceof FirebaseError && e.code === 'failed-precondition') {
      cachedDb = getFirestore(app);
    } else {
      throw e;
    }
  }
  return cachedDb;
}

// Named export kept for future modules that want the app eagerly.
export const firebaseConfigPresent = readConfig() !== null;
