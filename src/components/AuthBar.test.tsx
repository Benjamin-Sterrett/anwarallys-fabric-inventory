import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import AuthBar from './AuthBar';
import { subscribeToAuthState } from '@/lib/firebase/auth';
import { getUserByUid } from '@/lib/queries';
import { isAdminEmail } from '@/lib/auth/isAdmin';

const mockSubscribeToAuthState = vi.hoisted(() => vi.fn());
const mockGetUserByUid = vi.hoisted(() => vi.fn());
const mockIsAdminEmail = vi.hoisted(() => vi.fn());

vi.mock('@/lib/firebase/auth', () => ({
  subscribeToAuthState: mockSubscribeToAuthState,
  signOut: vi.fn(),
}));

vi.mock('@/lib/queries', () => ({
  getUserByUid: mockGetUserByUid,
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
    vi.mocked(getUserByUid).mockResolvedValue({ ok: true, data: null });
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
    vi.mocked(getUserByUid).mockResolvedValue({ ok: true, data: null });

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
    vi.mocked(getUserByUid).mockResolvedValue({ ok: true, data: null });

    renderWithRouter();

    const staffLink = await screen.findByRole('link', { name: /staff/i });
    await user.click(staffLink);
    expect(staffLink).toHaveAttribute('href', '/staff');
  });
});
