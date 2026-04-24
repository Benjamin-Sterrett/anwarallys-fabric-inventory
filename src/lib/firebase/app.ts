import { initializeApp, type FirebaseApp } from 'firebase/app';

// Firebase app boundary. Single source of truth for `initializeApp`.
// Full Firestore + Auth wiring (persistentLocalCache, persistentMultipleTabManager,
// initializeAuth w/ indexedDBLocalPersistence) lands in PRJ-780 and PRJ-781.
//
// IMPORTANT: Firebase web config IS client-safe. Rules (PRJ-805) are the authz
// surface. See README "Firebase config is public" for context.

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
    // Don't throw — CI builds have no .env.local. Log once, hand back null,
    // and let callers (PRJ-780+) decide how to surface the missing-config
    // state in-app. Scaffold routes do not touch Firebase yet.
    // eslint-disable-next-line no-console
    console.warn(
      `[firebase] Missing env vars: ${missing.join(', ')}. Firebase not initialized.`,
    );
    return null;
  }
  return values as FirebaseWebConfig;
}

let cachedApp: FirebaseApp | null = null;

export function getFirebaseApp(): FirebaseApp | null {
  if (cachedApp) return cachedApp;
  const config = readConfig();
  if (!config) return null;
  cachedApp = initializeApp(config);
  return cachedApp;
}

// Named export kept for future modules that want the app eagerly.
export const firebaseConfigPresent = readConfig() !== null;
