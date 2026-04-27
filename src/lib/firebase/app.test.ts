import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockDb = { type: 'firestore' };
const mockAuth = { type: 'auth' };

let initFirestoreThrow: Error | null = null;
let initAuthThrow: Error | null = null;

vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(() => ({ name: 'mock-app' })),
  getApp: vi.fn(() => ({ name: 'mock-app' })),
  getApps: vi.fn(() => []),
  FirebaseError: class FirebaseError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
      this.name = 'FirebaseError';
    }
  },
}));

vi.mock('firebase/firestore', () => ({
  initializeFirestore: vi.fn(() => {
    if (initFirestoreThrow) throw initFirestoreThrow;
    return mockDb;
  }),
  getFirestore: vi.fn(() => mockDb),
  persistentLocalCache: vi.fn(() => ({ type: 'cache' })),
  persistentMultipleTabManager: vi.fn(() => ({ type: 'tabs' })),
}));

vi.mock('firebase/auth', () => ({
  initializeAuth: vi.fn(() => {
    if (initAuthThrow) throw initAuthThrow;
    return mockAuth;
  }),
  getAuth: vi.fn(() => mockAuth),
  indexedDBLocalPersistence: { type: 'indexedDB' },
  browserLocalPersistence: { type: 'localStorage' },
}));

const ENV_KEYS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
];

function setFirebaseEnv() {
  ENV_KEYS.forEach((k) => {
    (import.meta.env as Record<string, string>)[k] = 'test';
  });
}

function clearFirebaseEnv() {
  ENV_KEYS.forEach((k) => {
    delete (import.meta.env as Record<string, string | undefined>)[k];
  });
}

describe('getDb()', () => {
  beforeEach(() => {
    vi.resetModules();
    clearFirebaseEnv();
    initFirestoreThrow = null;
  });

  it('returns null when config is missing', async () => {
    const { getDb } = await import('./app');
    expect(getDb()).toBeNull();
  });

  it('returns Firestore instance when config is present', async () => {
    setFirebaseEnv();
    const { getDb } = await import('./app');
    expect(getDb()).toBe(mockDb);
  });

  it('handles HMR failed-precondition gracefully', async () => {
    setFirebaseEnv();
    const { FirebaseError } = await import('firebase/app');
    initFirestoreThrow = new FirebaseError('failed-precondition', 'already initialized');
    const { getDb } = await import('./app');
    expect(getDb()).toBe(mockDb);
  });

  it('re-throws non-HMR init errors', async () => {
    setFirebaseEnv();
    initFirestoreThrow = new Error('IndexedDB quota exceeded');
    const { getDb } = await import('./app');
    expect(() => getDb()).toThrow('IndexedDB quota exceeded');
  });
});

describe('getAuth()', () => {
  beforeEach(() => {
    vi.resetModules();
    clearFirebaseEnv();
    initAuthThrow = null;
  });

  it('returns null when config is missing', async () => {
    const { getAuth } = await import('./auth');
    expect(getAuth()).toBeNull();
  });

  it('returns Auth instance when config is present', async () => {
    setFirebaseEnv();
    const { getAuth } = await import('./auth');
    expect(getAuth()).toBe(mockAuth);
  });

  it('handles HMR already-initialized gracefully', async () => {
    setFirebaseEnv();
    initAuthThrow = new Error('auth/already-initialized');
    const { getAuth } = await import('./auth');
    expect(getAuth()).toBe(mockAuth);
  });
});
