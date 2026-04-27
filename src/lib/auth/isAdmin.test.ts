import { describe, it, expect, vi } from 'vitest';
import { isAdminEmail } from './isAdmin';

describe('isAdminEmail()', () => {
  it('returns true when email matches VITE_ADMIN_EMAIL (same case)', () => {
    vi.stubEnv('VITE_ADMIN_EMAIL', 'admin@fabric.local');
    expect(isAdminEmail('admin@fabric.local')).toBe(true);
  });

  it('returns true when email matches VITE_ADMIN_EMAIL (different case)', () => {
    vi.stubEnv('VITE_ADMIN_EMAIL', 'Admin@Fabric.Local');
    expect(isAdminEmail('admin@fabric.local')).toBe(true);
  });

  it('returns false when email does not match', () => {
    vi.stubEnv('VITE_ADMIN_EMAIL', 'admin@fabric.local');
    expect(isAdminEmail('user@fabric.local')).toBe(false);
  });

  it('returns false when VITE_ADMIN_EMAIL is missing', () => {
    vi.stubEnv('VITE_ADMIN_EMAIL', '');
    expect(isAdminEmail('admin@fabric.local')).toBe(false);
  });

  it('returns false when email is null', () => {
    vi.stubEnv('VITE_ADMIN_EMAIL', 'admin@fabric.local');
    expect(isAdminEmail(null)).toBe(false);
  });

  it('returns false when email is undefined', () => {
    vi.stubEnv('VITE_ADMIN_EMAIL', 'admin@fabric.local');
    expect(isAdminEmail(undefined)).toBe(false);
  });

  it('returns false for empty string email', () => {
    vi.stubEnv('VITE_ADMIN_EMAIL', 'admin@fabric.local');
    expect(isAdminEmail('')).toBe(false);
  });

  it('returns false when VITE_ADMIN_EMAIL is not a string', () => {
    // @ts-expect-error — testing runtime misconfiguration
    vi.stubEnv('VITE_ADMIN_EMAIL', 123);
    expect(isAdminEmail('admin@fabric.local')).toBe(false);
  });
});
