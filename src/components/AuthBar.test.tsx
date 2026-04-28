import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import AuthBar from './AuthBar';
import { subscribeToAuthState } from '@/lib/firebase/auth';
import { subscribeToUserByUid, subscribeToAllActiveItems } from '@/lib/queries';
import { isAdminEmail } from '@/lib/auth/isAdmin';

const mockSubscribeToAuthState = vi.hoisted(() => vi.fn());
const mockSubscribeToUserByUid = vi.hoisted(() => vi.fn());
const mockSubscribeToAllActiveItems = vi.hoisted(() => vi.fn());
const mockSignOut = vi.hoisted(() => vi.fn());
const mockIsAdminEmail = vi.hoisted(() => vi.fn());

vi.mock('@/lib/firebase/auth', () => ({
  subscribeToAuthState: mockSubscribeToAuthState,
  signOut: mockSignOut,
}));

vi.mock('@/lib/queries', () => ({
  subscribeToUserByUid: mockSubscribeToUserByUid,
  subscribeToAllActiveItems: mockSubscribeToAllActiveItems,
}));

vi.mock('@/lib/auth/isAdmin', () => ({
  isAdminEmail: mockIsAdminEmail,
}));

const fakeUser = (overrides?: Partial<{ email: string; emailVerified: boolean; uid: string; displayName: string | null }>) => ({
  email: 'staff@fabric.local',
  emailVerified: true,
  uid: 'uid-1',
  displayName: null,
  ...overrides,
}) as unknown as import('firebase/auth').User;

function renderWithRouter() {
  return render(
    <MemoryRouter>
      <AuthBar />
    </MemoryRouter>,
  );
}

describe('AuthBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(subscribeToAuthState).mockImplementation((cb) => {
      cb(null);
      return vi.fn();
    });
    vi.mocked(subscribeToUserByUid).mockReturnValue(vi.fn());
    vi.mocked(subscribeToAllActiveItems).mockReturnValue(vi.fn());
    vi.mocked(isAdminEmail).mockReturnValue(false);
  });

  it('renders nothing when signed out', async () => {
    vi.mocked(subscribeToAuthState).mockImplementation((cb) => {
      cb(null);
      return vi.fn();
    });

    renderWithRouter();

    await waitFor(() => {
      expect(screen.queryByText(/Signed in as/)).not.toBeInTheDocument();
    });
  });

  it('renders Staff link for admin with verified email', async () => {
    vi.mocked(isAdminEmail).mockReturnValue(true);
    vi.mocked(subscribeToAuthState).mockImplementation((cb) => {
      cb(fakeUser({ email: 'admin@fabric.local', emailVerified: true }));
      return vi.fn();
    });

    renderWithRouter();

    const staffLink = await screen.findByRole('link', { name: /staff/i });
    expect(staffLink).toBeInTheDocument();
    expect(staffLink).toHaveAttribute('href', '/staff');
  });

  it('does not render Staff link for non-admin', async () => {
    vi.mocked(isAdminEmail).mockReturnValue(false);
    vi.mocked(subscribeToAuthState).mockImplementation((cb) => {
      cb(fakeUser());
      return vi.fn();
    });

    renderWithRouter();

    await screen.findByText(/Signed in as/);
    expect(screen.queryByRole('link', { name: /staff/i })).not.toBeInTheDocument();
  });

  it('does not render Staff link when email is not verified', async () => {
    vi.mocked(isAdminEmail).mockReturnValue(true);
    vi.mocked(subscribeToAuthState).mockImplementation((cb) => {
      cb(fakeUser({ emailVerified: false }));
      return vi.fn();
    });

    renderWithRouter();

    await screen.findByText(/Signed in as/);
    expect(screen.queryByRole('link', { name: /staff/i })).not.toBeInTheDocument();
  });

  it('navigates to /staff when Staff link is clicked', async () => {
    const user = userEvent.setup();
    vi.mocked(isAdminEmail).mockReturnValue(true);
    vi.mocked(subscribeToAuthState).mockImplementation((cb) => {
      cb(fakeUser({ email: 'admin@fabric.local', emailVerified: true }));
      return vi.fn();
    });

    renderWithRouter();

    const staffLink = await screen.findByRole('link', { name: /staff/i });
    await user.click(staffLink);
    expect(staffLink).toHaveAttribute('href', '/staff');
  });

  it('renders Low stock link for signed-in users', async () => {
    vi.mocked(subscribeToAuthState).mockImplementation((cb) => {
      cb(fakeUser());
      return vi.fn();
    });
    vi.mocked(subscribeToAllActiveItems).mockImplementation((_onNext) => vi.fn());

    renderWithRouter();

    const link = await screen.findByRole('link', { name: /low stock/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/lowstock');
  });

  it('does not render Low stock link when signed out', async () => {
    vi.mocked(subscribeToAuthState).mockImplementation((cb) => {
      cb(null);
      return vi.fn();
    });

    renderWithRouter();

    await waitFor(() => {
      expect(screen.queryByRole('link', { name: /low stock/i })).not.toBeInTheDocument();
    });
  });

  it('hides badge when low stock count is 0', async () => {
    vi.mocked(subscribeToAuthState).mockImplementation((cb) => {
      cb(fakeUser());
      return vi.fn();
    });
    vi.mocked(subscribeToAllActiveItems).mockImplementation((onNext) => {
      onNext([
        { remainingMeters: 10, minimumMeters: 5 } as import('@/lib/models').RollItem,
      ]);
      return vi.fn();
    });

    renderWithRouter();

    await screen.findByRole('link', { name: /low stock/i });
    expect(screen.queryByText('1')).not.toBeInTheDocument();
  });

  it('shows badge when low stock count is > 0', async () => {
    vi.mocked(subscribeToAuthState).mockImplementation((cb) => {
      cb(fakeUser());
      return vi.fn();
    });
    vi.mocked(subscribeToAllActiveItems).mockImplementation((onNext) => {
      onNext([
        { remainingMeters: 3, minimumMeters: 5 } as import('@/lib/models').RollItem,
        { remainingMeters: 10, minimumMeters: 5 } as import('@/lib/models').RollItem,
      ]);
      return vi.fn();
    });

    renderWithRouter();

    await screen.findByRole('link', { name: /low stock/i });
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('renders both Low stock and Staff links for admin', async () => {
    vi.mocked(isAdminEmail).mockReturnValue(true);
    vi.mocked(subscribeToAuthState).mockImplementation((cb) => {
      cb(fakeUser({ email: 'admin@fabric.local', emailVerified: true }));
      return vi.fn();
    });
    vi.mocked(subscribeToAllActiveItems).mockImplementation((_onNext) => vi.fn());

    renderWithRouter();

    expect(await screen.findByRole('link', { name: /low stock/i })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: /staff/i })).toBeInTheDocument();
  });

  it('renders Change password link for signed-in users', async () => {
    vi.mocked(subscribeToAuthState).mockImplementation((cb) => {
      cb(fakeUser());
      return vi.fn();
    });
    vi.mocked(subscribeToAllActiveItems).mockImplementation((_onNext) => vi.fn());

    renderWithRouter();

    const link = await screen.findByRole('link', { name: /change password/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/change-password');
  });

  it('renders Recently deleted link for signed-in users', async () => {
    vi.mocked(subscribeToAuthState).mockImplementation((cb) => {
      cb(fakeUser());
      return vi.fn();
    });
    vi.mocked(subscribeToAllActiveItems).mockImplementation((_onNext) => vi.fn());

    renderWithRouter();

    const link = await screen.findByRole('link', { name: /recently deleted/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/deleted');
  });

  it('does not render Change password link when signed out', async () => {
    vi.mocked(subscribeToAuthState).mockImplementation((cb) => {
      cb(null);
      return vi.fn();
    });

    renderWithRouter();

    await waitFor(() => {
      expect(screen.queryByRole('link', { name: /change password/i })).not.toBeInTheDocument();
    });
  });

  describe('deactivation guard (PRJ-910)', () => {
    it('calls signOut and renders the toast when user is deactivated', async () => {
      vi.mocked(subscribeToAuthState).mockImplementation((cb) => {
        cb(fakeUser());
        return vi.fn();
      });
      vi.mocked(subscribeToUserByUid).mockImplementation((_uid, onNext) => {
        onNext({
          uid: 'uid-1',
          email: 'staff@fabric.local',
          displayName: 'Staff User',
          isActive: false,
          createdAt: { toMillis: () => 0 } as unknown as import('firebase/firestore').Timestamp,
          updatedAt: { toMillis: () => 0 } as unknown as import('firebase/firestore').Timestamp,
          createdBy: 'admin-1',
          updatedBy: 'admin-1',
        });
        return vi.fn();
      });

      renderWithRouter();

      await waitFor(() => {
        expect(mockSignOut).toHaveBeenCalledTimes(1);
      });
      expect(
        screen.getByText(/Your account has been turned off\. Contact your store admin to be reactivated\./),
      ).toBeInTheDocument();
    });

    it('does NOT call signOut and does NOT render toast when user is active', async () => {
      vi.mocked(subscribeToAuthState).mockImplementation((cb) => {
        cb(fakeUser());
        return vi.fn();
      });
      vi.mocked(subscribeToUserByUid).mockImplementation((_uid, onNext) => {
        onNext({
          uid: 'uid-1',
          email: 'staff@fabric.local',
          displayName: 'Staff User',
          isActive: true,
          createdAt: { toMillis: () => 0 } as unknown as import('firebase/firestore').Timestamp,
          updatedAt: { toMillis: () => 0 } as unknown as import('firebase/firestore').Timestamp,
          createdBy: 'admin-1',
          updatedBy: 'admin-1',
        });
        return vi.fn();
      });

      renderWithRouter();

      await screen.findByText(/Signed in as/);
      expect(mockSignOut).not.toHaveBeenCalled();
      expect(
        screen.queryByText(/Your account has been turned off/),
      ).not.toBeInTheDocument();
    });

    it('clears the toast when a deactivated user is reactivated mid-session', async () => {
      let snapshotCb: ((user: import('@/lib/models').User | null) => void) | null = null;
      vi.mocked(subscribeToAuthState).mockImplementation((cb) => {
        cb(fakeUser());
        return vi.fn();
      });
      vi.mocked(subscribeToUserByUid).mockImplementation((_uid, onNext) => {
        snapshotCb = onNext;
        onNext({
          uid: 'uid-1',
          email: 'staff@fabric.local',
          displayName: 'Staff User',
          isActive: false,
          createdAt: { toMillis: () => 0 } as unknown as import('firebase/firestore').Timestamp,
          updatedAt: { toMillis: () => 0 } as unknown as import('firebase/firestore').Timestamp,
          createdBy: 'admin-1',
          updatedBy: 'admin-1',
        });
        return vi.fn();
      });

      renderWithRouter();

      await waitFor(() => {
        expect(
          screen.getByText(/Your account has been turned off\. Contact your store admin to be reactivated\./),
        ).toBeInTheDocument();
      });

      // Simulate admin reactivating the user mid-session
      act(() => {
        snapshotCb?.({
          uid: 'uid-1',
          email: 'staff@fabric.local',
          displayName: 'Staff User',
          isActive: true,
          createdAt: { toMillis: () => 0 } as unknown as import('firebase/firestore').Timestamp,
          updatedAt: { toMillis: () => 0 } as unknown as import('firebase/firestore').Timestamp,
          createdBy: 'admin-1',
          updatedBy: 'admin-1',
        });
      });

      await waitFor(() => {
        expect(
          screen.queryByText(/Your account has been turned off/),
        ).not.toBeInTheDocument();
      });
      // signOut should only have been called once (on the first deactivate snapshot)
      expect(mockSignOut).toHaveBeenCalledTimes(1);
    });

    it('does NOT call signOut when user doc is missing', async () => {
      vi.mocked(subscribeToAuthState).mockImplementation((cb) => {
        cb(fakeUser());
        return vi.fn();
      });
      vi.mocked(subscribeToUserByUid).mockImplementation((_uid, onNext) => {
        onNext(null);
        return vi.fn();
      });

      renderWithRouter();

      await screen.findByText(/Signed in as/);
      expect(mockSignOut).not.toHaveBeenCalled();
    });

    it('does NOT call signOut for deactivated admin (recovery path)', async () => {
      vi.mocked(isAdminEmail).mockReturnValue(true);
      vi.mocked(subscribeToAuthState).mockImplementation((cb) => {
        cb(fakeUser({ email: 'admin@fabric.local', emailVerified: true }));
        return vi.fn();
      });
      vi.mocked(subscribeToUserByUid).mockImplementation((_uid, onNext) => {
        onNext({
          uid: 'uid-1',
          email: 'admin@fabric.local',
          displayName: 'Admin User',
          isActive: false,
          createdAt: { toMillis: () => 0 } as unknown as import('firebase/firestore').Timestamp,
          updatedAt: { toMillis: () => 0 } as unknown as import('firebase/firestore').Timestamp,
          createdBy: 'admin-1',
          updatedBy: 'admin-1',
        });
        return vi.fn();
      });

      renderWithRouter();

      await waitFor(() => {
        expect(
          screen.getByText(/Your account has been turned off\. Contact your store admin to be reactivated\./),
        ).toBeInTheDocument();
      });
      expect(mockSignOut).not.toHaveBeenCalled();
      // Admin must still see the Staff link so they can navigate to /staff
      // and reactivate themselves.
      expect(screen.getByRole('link', { name: /staff/i })).toBeInTheDocument();
    });

    it('keeps toast visible after sign-out for deactivated non-admin', async () => {
      let authCb: ((user: import('firebase/auth').User | null) => void) | null = null;
      vi.mocked(subscribeToAuthState).mockImplementation((cb) => {
        authCb = cb;
        cb(fakeUser());
        return vi.fn();
      });
      vi.mocked(subscribeToUserByUid).mockImplementation((_uid, onNext) => {
        onNext({
          uid: 'uid-1',
          email: 'staff@fabric.local',
          displayName: 'Staff User',
          isActive: false,
          createdAt: { toMillis: () => 0 } as unknown as import('firebase/firestore').Timestamp,
          updatedAt: { toMillis: () => 0 } as unknown as import('firebase/firestore').Timestamp,
          createdBy: 'admin-1',
          updatedBy: 'admin-1',
        });
        return vi.fn();
      });

      renderWithRouter();

      await waitFor(() => {
        expect(mockSignOut).toHaveBeenCalledTimes(1);
      });
      expect(
        screen.getByText(/Your account has been turned off\. Contact your store admin to be reactivated\./),
      ).toBeInTheDocument();

      // Simulate auth state becoming null after signOut
      act(() => {
        authCb?.(null);
      });

      // Toast must still be visible even though authUser is now null
      await waitFor(() => {
        expect(
          screen.getByText(/Your account has been turned off\. Contact your store admin to be reactivated\./),
        ).toBeInTheDocument();
      });
      // The normal bar (Signed in as) should no longer render
      expect(screen.queryByText(/Signed in as/)).not.toBeInTheDocument();
    });

    it('does NOT call signOut for deactivated admin with unverified email', async () => {
      vi.mocked(isAdminEmail).mockReturnValue(true);
      vi.mocked(subscribeToAuthState).mockImplementation((cb) => {
        cb(fakeUser({ email: 'admin@fabric.local', emailVerified: false }));
        return vi.fn();
      });
      vi.mocked(subscribeToUserByUid).mockImplementation((_uid, onNext) => {
        onNext({
          uid: 'uid-1',
          email: 'admin@fabric.local',
          displayName: 'Admin User',
          isActive: false,
          createdAt: { toMillis: () => 0 } as unknown as import('firebase/firestore').Timestamp,
          updatedAt: { toMillis: () => 0 } as unknown as import('firebase/firestore').Timestamp,
          createdBy: 'admin-1',
          updatedBy: 'admin-1',
        });
        return vi.fn();
      });

      renderWithRouter();

      await waitFor(() => {
        expect(mockSignOut).toHaveBeenCalledTimes(1);
      });
    });
  });
});
