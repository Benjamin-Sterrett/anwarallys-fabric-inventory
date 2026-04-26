/// <reference types="vite/client" />

// All Firebase web-SDK config is client-safe — Firestore Security Rules guard it.
// See README "Firebase config is public" section for why committing VITE_FIREBASE_*
// values is correct in the deployed bundle.
interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN: string;
  readonly VITE_FIREBASE_PROJECT_ID: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
  readonly VITE_FIREBASE_APP_ID: string;
  // Admin gate (PRJ-856). Compared case-insensitively against the signed-in
  // user's email; see src/lib/auth/isAdmin.ts.
  readonly VITE_ADMIN_EMAIL: string;
  // Public host for QR code URLs (PRJ-792). Must be short — no scheme prefix.
  readonly VITE_PUBLIC_HOST: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
