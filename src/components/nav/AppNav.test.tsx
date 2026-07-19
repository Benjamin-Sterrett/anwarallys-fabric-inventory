import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import AppNav from './AppNav';
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

const fakeUser = (
  overrides?: Partial<{ email: string; emailVerified: boolean; uid: string; displayName: string | null }>,
) =>
  ({
    email: 'staff@fabric.local',
    emailVerified: true,
    uid: 'uid-1',
    displayName: null,
    ...overrides,
  }) as unknown as import('firebase/auth').User;

const userDoc = (overrides?: Partial<import('@/lib/models').User>) =>
  ({
    uid: 'uid-1',
    email: 'staff@fabric.local',
    displayName: 'Staff User',
    isActive: true,
    createdAt: { toMillis: () => 0 } as unknown as import('firebase/firestore').Timestamp,
    updatedAt: { toMillis: () => 0 } as unknown as import('firebase/firestore').Timestamp,
    createdBy: 'admin-1',
    updatedBy: 'admin-1',
    ...overrides,
  }) as import('@/lib/models').User;

let lastPath = '';
function LocationProbe() {
  lastPath = useLocation().pathname;
  return <span data-testid="path">{lastPath}</span>;
}

function renderNav(opts?: { initialEntries?: string[]; children?: React.ReactNode }) {
  return render(
    <MemoryRouter initialEntries={opts?.initialEntries ?? ['/']}>
      <AppNav>{opts?.children}</AppNav>
      <LocationProbe />
    </MemoryRouter>,
  );
}

// The desktop Sidebar is always in the DOM (CSS `hidden lg:flex` only hides it
// visually), so scoping nav-link assertions to it avoids the mobile TopBar's
// duplicate low-stock badge. Testing-library queries ignore CSS visibility.
const sidebar = () => screen.getByRole('complementary', { name: 'Sidebar' });

function signIn(user = fakeUser()) {
  vi.mocked(subscribeToAuthState).mockImplementation((cb) => {
    cb(user);
    return vi.fn();
  });
}

describe('AppNav', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(subscribeToAuthState).mockImplementation((cb) => {
      cb(null);
      return vi.fn();
    });
    vi.mocked(subscribeToUserByUid).mockReturnValue(vi.fn());
    vi.mocked(subscribeToAllActiveItems).mockReturnValue(vi.fn());
    vi.mocked(isAdminEmail).mockReturnValue(false);
    // happy-dom does not implement window.confirm — stub it (default: accept).
    vi.stubGlobal('confirm', vi.fn(() => true));
  });

  it('renders no nav chrome when signed out', async () => {
    renderNav();
    await waitFor(() => {
      expect(screen.queryByText(/Signed in as/)).not.toBeInTheDocument();
    });
    expect(screen.queryByRole('complementary', { name: 'Sidebar' })).not.toBeInTheDocument();
  });

  it('renders the full nav item list in the sidebar for a signed-in staff user', async () => {
    signIn();
    renderNav();
    await screen.findByText(/Signed in as/);
    const nav = within(sidebar());
    expect(nav.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    expect(nav.getByRole('link', { name: /find/i })).toHaveAttribute('href', '/find');
    expect(nav.getByRole('link', { name: /low stock/i })).toHaveAttribute('href', '/lowstock');
    expect(nav.getByRole('link', { name: /change password/i })).toHaveAttribute('href', '/change-password');
    expect(nav.getByRole('link', { name: /recently deleted/i })).toHaveAttribute('href', '/deleted');
    // Non-admin: no Staff.
    expect(nav.queryByRole('link', { name: /staff/i })).not.toBeInTheDocument();
  });

  it('marks Home active (aria-current) on "/" — NavLink end', async () => {
    signIn();
    renderNav({ initialEntries: ['/'] });
    await screen.findByText(/Signed in as/);
    const home = within(sidebar()).getByRole('link', { name: 'Home' });
    expect(home).toHaveAttribute('aria-current', 'page');
  });

  it('does NOT mark Home active on a non-root route (end match)', async () => {
    signIn();
    renderNav({ initialEntries: ['/find'] });
    await screen.findByText(/Signed in as/);
    const nav = within(sidebar());
    expect(nav.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current');
    expect(nav.getByRole('link', { name: /find/i })).toHaveAttribute('aria-current', 'page');
  });

  it('has 48px min tap targets on nav rows', async () => {
    signIn();
    renderNav();
    await screen.findByText(/Signed in as/);
    expect(within(sidebar()).getByRole('link', { name: /find/i }).className).toContain('min-h-12');
  });

  describe('admin gating of the Staff item', () => {
    it('renders Staff for admin with verified email', async () => {
      vi.mocked(isAdminEmail).mockReturnValue(true);
      signIn(fakeUser({ email: 'admin@fabric.local', emailVerified: true }));
      renderNav();
      const staff = await within(sidebar()).findByRole('link', { name: /staff/i });
      expect(staff).toHaveAttribute('href', '/staff');
    });

    it('does NOT render Staff for non-admin', async () => {
      vi.mocked(isAdminEmail).mockReturnValue(false);
      signIn();
      renderNav();
      await screen.findByText(/Signed in as/);
      expect(within(sidebar()).queryByRole('link', { name: /staff/i })).not.toBeInTheDocument();
    });

    it('does NOT render Staff when email is unverified', async () => {
      vi.mocked(isAdminEmail).mockReturnValue(true);
      signIn(fakeUser({ emailVerified: false }));
      renderNav();
      await screen.findByText(/Signed in as/);
      expect(within(sidebar()).queryByRole('link', { name: /staff/i })).not.toBeInTheDocument();
    });
  });

  describe('live low-stock badge', () => {
    it('hides the badge when the count is 0', async () => {
      signIn();
      vi.mocked(subscribeToAllActiveItems).mockImplementation((onNext) => {
        onNext([{ remainingMeters: 10, minimumMeters: 5 } as import('@/lib/models').RollItem]);
        return vi.fn();
      });
      renderNav();
      await screen.findByText(/Signed in as/);
      expect(screen.queryByText('1')).not.toBeInTheDocument();
    });

    it('shows the count when > 0', async () => {
      signIn();
      vi.mocked(subscribeToAllActiveItems).mockImplementation((onNext) => {
        onNext([
          { remainingMeters: 3, minimumMeters: 5 } as import('@/lib/models').RollItem,
          { remainingMeters: 10, minimumMeters: 5 } as import('@/lib/models').RollItem,
        ]);
        return vi.fn();
      });
      renderNav();
      await screen.findByText(/Signed in as/);
      expect(within(sidebar()).getByText('1')).toBeInTheDocument();
    });
  });

  describe('sign out', () => {
    it('confirms, calls signOut, and navigates to /login', async () => {
      signIn();
      renderNav();
      const btn = await within(sidebar()).findByRole('button', { name: /sign out/i });
      fireEvent.click(btn);
      expect(window.confirm).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(lastPath).toBe('/login'));
    });

    it('does NOT sign out when the confirm is cancelled', async () => {
      vi.stubGlobal('confirm', vi.fn(() => false));
      signIn();
      renderNav();
      const btn = await within(sidebar()).findByRole('button', { name: /sign out/i });
      fireEvent.click(btn);
      expect(window.confirm).toHaveBeenCalledTimes(1);
      expect(mockSignOut).not.toHaveBeenCalled();
    });

    it('surfaces an inline error when signOut fails', async () => {
      signIn();
      mockSignOut.mockRejectedValueOnce(new Error('network down'));
      renderNav();
      const btn = await within(sidebar()).findByRole('button', { name: /sign out/i });
      fireEvent.click(btn);
      expect(await screen.findByText(/Could not sign out: network down/)).toBeInTheDocument();
    });
  });

  describe('displayName fallback chain (PRJ-781)', () => {
    it('prefers the Firestore displayName', async () => {
      signIn();
      vi.mocked(subscribeToUserByUid).mockImplementation((_uid, onNext) => {
        onNext(userDoc({ displayName: 'Aisha' }));
        return vi.fn();
      });
      renderNav();
      expect(await within(sidebar()).findByText('Aisha')).toBeInTheDocument();
    });

    it('falls back to the email when there is no Firestore doc', async () => {
      signIn(fakeUser({ email: 'fallback@fabric.local' }));
      vi.mocked(subscribeToUserByUid).mockImplementation((_uid, onNext) => {
        onNext(null);
        return vi.fn();
      });
      renderNav();
      expect(await within(sidebar()).findByText('fallback@fabric.local')).toBeInTheDocument();
    });
  });

  describe('deactivation guard (PRJ-910)', () => {
    it('signs out a non-admin and shows the banner when deactivated', async () => {
      signIn();
      vi.mocked(subscribeToUserByUid).mockImplementation((_uid, onNext) => {
        onNext(userDoc({ isActive: false }));
        return vi.fn();
      });
      renderNav();
      await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1));
      expect(
        screen.getByText(/Your account has been turned off\. Contact your store admin to be reactivated\./),
      ).toBeInTheDocument();
    });

    it('does NOT sign out or show the banner for an active user', async () => {
      signIn();
      vi.mocked(subscribeToUserByUid).mockImplementation((_uid, onNext) => {
        onNext(userDoc({ isActive: true }));
        return vi.fn();
      });
      renderNav();
      await screen.findByText(/Signed in as/);
      expect(mockSignOut).not.toHaveBeenCalled();
      expect(screen.queryByText(/Your account has been turned off/)).not.toBeInTheDocument();
    });

    it('does NOT sign out a deactivated admin (recovery path keeps Staff)', async () => {
      vi.mocked(isAdminEmail).mockReturnValue(true);
      signIn(fakeUser({ email: 'admin@fabric.local', emailVerified: true }));
      vi.mocked(subscribeToUserByUid).mockImplementation((_uid, onNext) => {
        onNext(userDoc({ email: 'admin@fabric.local', displayName: 'Admin User', isActive: false }));
        return vi.fn();
      });
      renderNav();
      await waitFor(() => {
        expect(
          screen.getByText(/Your account has been turned off\. Contact your store admin to be reactivated\./),
        ).toBeInTheDocument();
      });
      expect(mockSignOut).not.toHaveBeenCalled();
      expect(within(sidebar()).getByRole('link', { name: /staff/i })).toBeInTheDocument();
    });

    it('does NOT sign out when the user doc is missing', async () => {
      signIn();
      vi.mocked(subscribeToUserByUid).mockImplementation((_uid, onNext) => {
        onNext(null);
        return vi.fn();
      });
      renderNav();
      await screen.findByText(/Signed in as/);
      expect(mockSignOut).not.toHaveBeenCalled();
    });

    it('clears the banner when a deactivated user is reactivated mid-session', async () => {
      let snapshotCb: ((user: import('@/lib/models').User | null) => void) | null = null;
      signIn();
      vi.mocked(subscribeToUserByUid).mockImplementation((_uid, onNext) => {
        snapshotCb = onNext;
        onNext(userDoc({ isActive: false }));
        return vi.fn();
      });
      renderNav();
      await waitFor(() => {
        expect(screen.getByText(/Your account has been turned off/)).toBeInTheDocument();
      });
      act(() => {
        snapshotCb?.(userDoc({ isActive: true }));
      });
      await waitFor(() => {
        expect(screen.queryByText(/Your account has been turned off/)).not.toBeInTheDocument();
      });
      expect(mockSignOut).toHaveBeenCalledTimes(1);
    });

    it('keeps the banner visible after auth becomes null (non-admin)', async () => {
      let authCb: ((user: import('firebase/auth').User | null) => void) | null = null;
      vi.mocked(subscribeToAuthState).mockImplementation((cb) => {
        authCb = cb;
        cb(fakeUser());
        return vi.fn();
      });
      vi.mocked(subscribeToUserByUid).mockImplementation((_uid, onNext) => {
        onNext(userDoc({ isActive: false }));
        return vi.fn();
      });
      renderNav();
      await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1));
      act(() => {
        authCb?.(null);
      });
      await waitFor(() => {
        expect(screen.getByText(/Your account has been turned off/)).toBeInTheDocument();
      });
      expect(screen.queryByText(/Signed in as/)).not.toBeInTheDocument();
    });
  });

  describe('mobile drawer', () => {
    it('opens the drawer from the ☰ and reflects aria-expanded', async () => {
      signIn();
      renderNav();
      const hamburger = await screen.findByRole('button', { name: 'Menu' });
      expect(hamburger).toHaveAttribute('aria-expanded', 'false');
      fireEvent.click(hamburger);
      const dialog = await screen.findByRole('dialog', { name: 'Menu' });
      expect(dialog).toBeInTheDocument();
      expect(hamburger).toHaveAttribute('aria-expanded', 'true');
      // Focus moved into the drawer.
      expect(dialog.contains(document.activeElement)).toBe(true);
    });

    it('closes on Escape and returns focus to the ☰', async () => {
      signIn();
      renderNav();
      const hamburger = await screen.findByRole('button', { name: 'Menu' });
      fireEvent.click(hamburger);
      const dialog = await screen.findByRole('dialog', { name: 'Menu' });
      fireEvent.keyDown(dialog, { key: 'Escape' });
      await waitFor(() => {
        expect(screen.queryByRole('dialog', { name: 'Menu' })).not.toBeInTheDocument();
      });
      expect(document.activeElement).toBe(hamburger);
    });

    it('closes when the overlay is clicked', async () => {
      signIn();
      const { container } = renderNav();
      fireEvent.click(await screen.findByRole('button', { name: 'Menu' }));
      await screen.findByRole('dialog', { name: 'Menu' });
      const overlay = container.querySelector('.drawer-overlay');
      expect(overlay).not.toBeNull();
      fireEvent.click(overlay as Element);
      await waitFor(() => {
        expect(screen.queryByRole('dialog', { name: 'Menu' })).not.toBeInTheDocument();
      });
    });

    it('closes when a nav item is tapped', async () => {
      signIn();
      renderNav();
      fireEvent.click(await screen.findByRole('button', { name: 'Menu' }));
      const dialog = await screen.findByRole('dialog', { name: 'Menu' });
      fireEvent.click(within(dialog).getByRole('link', { name: /recently deleted/i }));
      await waitFor(() => {
        expect(screen.queryByRole('dialog', { name: 'Menu' })).not.toBeInTheDocument();
      });
    });

    it('closes on a route change (not via item tap) and returns focus to the ☰', async () => {
      signIn();
      renderNav({ initialEntries: ['/'] });
      const hamburger = await screen.findByRole('button', { name: 'Menu' });
      fireEvent.click(hamburger);
      await screen.findByRole('dialog', { name: 'Menu' });
      // Navigate via a SIDEBAR link — a pure route change that does NOT go
      // through the drawer's own onNavigate close handler.
      fireEvent.click(within(sidebar()).getByRole('link', { name: /find/i }));
      await waitFor(() => {
        expect(screen.queryByRole('dialog', { name: 'Menu' })).not.toBeInTheDocument();
      });
      expect(lastPath).toBe('/find');
      expect(document.activeElement).toBe(hamburger);
    });
  });
});
