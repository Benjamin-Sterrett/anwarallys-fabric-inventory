import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createStaffUser } from './users';
import { getDb, getFirebaseApp } from '@/lib/firebase/app';
import { FirebaseError } from 'firebase/app';
import {
  initializeApp,
  deleteApp,
} from 'firebase/app';
import {
  initializeAuth,
  createUserWithEmailAndPassword,
  deleteUser,
  updateProfile,
} from 'firebase/auth';
import { setDoc } from 'firebase/firestore';

vi.mock('@/lib/firebase/app', () => ({
  getDb: vi.fn(),
  getFirebaseApp: vi.fn(),
}));

vi.mock('firebase/app', async () => {
  const actual = await vi.importActual<typeof import('firebase/app')>('firebase/app');
  return {
    ...actual,
    initializeApp: vi.fn(),
    deleteApp: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('firebase/auth', () => ({
  initializeAuth: vi.fn(),
  inMemoryPersistence: {},
  createUserWithEmailAndPassword: vi.fn(),
  deleteUser: vi.fn(),
  updateProfile: vi.fn(),
}));

vi.mock('firebase/firestore', async () => {
  const actual = await vi.importActual<typeof import('firebase/firestore')>('firebase/firestore');
  return {
    ...actual,
    doc: vi.fn(() => ({ withConverter: () => ({}) })),
    setDoc: vi.fn(),
    serverTimestamp: vi.fn(() => 'SERVER_TS'),
  };
});

const fbErr = (code: string) => new FirebaseError(code, `mock ${code}`);

const validParams = {
  email: 'staff@example.com',
  password: 'password123',
  displayName: 'Staff User',
  adminUid: 'admin-uid-1',
};

const fakeSecondaryApp = { name: 'secondary-app' };
const fakeUser = { uid: 'new-uid', email: 'staff@example.com' };
const fakeCred = { user: fakeUser };
const fakeSecondaryAuth = { currentUser: fakeUser };

describe('createStaffUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getFirebaseApp).mockReturnValue({ options: {} } as ReturnType<typeof getFirebaseApp>);
    vi.mocked(getDb).mockReturnValue({} as ReturnType<typeof getDb>);
    vi.mocked(initializeApp).mockReturnValue(fakeSecondaryApp as ReturnType<typeof initializeApp>);
    vi.mocked(initializeAuth).mockReturnValue(fakeSecondaryAuth as ReturnType<typeof initializeAuth>);
    vi.mocked(createUserWithEmailAndPassword).mockResolvedValue(fakeCred as Awaited<ReturnType<typeof createUserWithEmailAndPassword>>);
    vi.mocked(updateProfile).mockResolvedValue(undefined);
    vi.mocked(setDoc).mockResolvedValue(undefined);
    vi.mocked(deleteUser).mockResolvedValue(undefined);
  });

  afterEach(() => {
    // Cleanup invariant: if a secondary app was initialized, it must always be deleted.
    if (vi.mocked(initializeApp).mock.calls.length > 0) {
      expect(
        vi.mocked(deleteApp).mock.calls.length,
        'deleteApp should have been called at least once to clean up the secondary app',
      ).toBeGreaterThanOrEqual(1);
    }
  });

  // ─── Input validation (5) ───

  it('rejects empty email', async () => {
    const r = await createStaffUser({ ...validParams, email: '' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('invalid-input');
      expect(r.error.message).toContain('email');
    }
  });

  it('rejects empty displayName', async () => {
    const r = await createStaffUser({ ...validParams, displayName: '' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('invalid-input');
      expect(r.error.message).toContain('displayName');
    }
  });

  it('rejects empty adminUid', async () => {
    const r = await createStaffUser({ ...validParams, adminUid: '' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('invalid-input');
      expect(r.error.message).toContain('adminUid');
    }
  });

  it('rejects password shorter than 6 chars', async () => {
    const r = await createStaffUser({ ...validParams, password: '12345' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('invalid-input');
      expect(r.error.message).toContain('password');
    }
  });

  it('rejects non-string password', async () => {
    const r = await createStaffUser({ ...validParams, password: undefined as unknown as string });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('invalid-input');
    }
  });

  // ─── Init failures (2) ───

  it('returns firestore/no-db when getFirebaseApp() returns null', async () => {
    vi.mocked(getFirebaseApp).mockReturnValue(null);
    const r = await createStaffUser(validParams);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('firestore/no-db');
    }
  });

  it('returns firestore/init-failed when getDb() throws', async () => {
    vi.mocked(getDb).mockImplementation(() => {
      throw new Error('IndexedDB disabled');
    });
    const r = await createStaffUser(validParams);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('firestore/init-failed');
      expect(r.error.message).toContain('IndexedDB disabled');
    }
  });

  // ─── createUserWithEmailAndPassword failures (3) ───

  it('returns auth/email-already-in-use without rollback when Auth create rejects definitively', async () => {
    vi.mocked(createUserWithEmailAndPassword).mockRejectedValue(fbErr('auth/email-already-in-use'));
    const r = await createStaffUser(validParams);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('auth/email-already-in-use');
      expect(r.error.message).not.toContain('Account state unknown');
    }
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('returns auth/network-request-failed with "Account state unknown" message when Auth create is ambiguous', async () => {
    vi.mocked(createUserWithEmailAndPassword).mockRejectedValue(fbErr('auth/network-request-failed'));
    const r = await createStaffUser(validParams);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('auth/network-request-failed');
      expect(r.error.message).toContain('Account state unknown');
      expect(r.error.message).toContain('Verify in Firebase Console');
    }
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('returns auth/internal-error with "Account state unknown" message', async () => {
    vi.mocked(createUserWithEmailAndPassword).mockRejectedValue(fbErr('auth/internal-error'));
    const r = await createStaffUser(validParams);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('auth/internal-error');
      expect(r.error.message).toContain('Account state unknown');
      expect(r.error.message).toContain('Verify in Firebase Console');
    }
    expect(deleteUser).not.toHaveBeenCalled();
  });

  // ─── updateProfile failures (2) ───

  it('rolls back Auth when updateProfile fails and deleteUser succeeds', async () => {
    vi.mocked(updateProfile).mockRejectedValue(fbErr('auth/user-token-expired'));
    vi.mocked(deleteUser).mockResolvedValue(undefined);
    const r = await createStaffUser(validParams);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('auth/profile-update-failed');
      expect(r.error.message).toContain('Auth account rolled back');
    }
    expect(deleteUser).toHaveBeenCalledTimes(1);
    expect(deleteUser).toHaveBeenCalledWith(fakeUser);
  });

  it('surfaces "Account state unknown" when updateProfile fails AND deleteUser also fails', async () => {
    vi.mocked(updateProfile).mockRejectedValue(fbErr('auth/user-token-expired'));
    vi.mocked(deleteUser).mockRejectedValue(new Error('rollback failed'));
    const r = await createStaffUser(validParams);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('auth/profile-update-failed');
      expect(r.error.message).toContain('Account state unknown');
    }
  });

  // ─── Firestore-write failures (3) ───

  it('rolls back Auth when setDoc fails with a rollbackable code', async () => {
    vi.mocked(setDoc).mockRejectedValue(fbErr('permission-denied'));
    vi.mocked(deleteUser).mockResolvedValue(undefined);
    const r = await createStaffUser(validParams);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('firestore/permission-denied');
      expect(r.error.message).toContain('Auth account rolled back');
    }
    expect(deleteUser).toHaveBeenCalledTimes(1);
  });

  it('does NOT roll back Auth when setDoc fails with an ambiguous code', async () => {
    vi.mocked(setDoc).mockRejectedValue(fbErr('unavailable'));
    const r = await createStaffUser(validParams);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('firestore/unavailable');
      expect(r.error.message).toContain('Auth account may exist');
      expect(r.error.message).toContain('Verify in Firebase Console');
    }
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('surfaces orphan-Auth message when setDoc fails AND deleteUser fails', async () => {
    vi.mocked(setDoc).mockRejectedValue(fbErr('invalid-argument'));
    vi.mocked(deleteUser).mockRejectedValue(new Error('rollback failed'));
    const r = await createStaffUser(validParams);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('firestore/invalid-argument');
      expect(r.error.message).toContain('Auth rollback also failed');
      expect(r.error.message).toContain('rollback failed');
      expect(r.error.message).toContain('Delete the orphan Auth user via Firebase Console');
    }
  });

  // ─── Cleanup invariant (cross-cutting, covered by afterEach) ───

  it('calls deleteApp on the secondary app in every test', async () => {
    // This test explicitly verifies the afterEach invariant on the happy path.
    const r = await createStaffUser(validParams);
    expect(r.ok).toBe(true);
    expect(deleteApp).toHaveBeenCalledWith(fakeSecondaryApp);
  });
});
