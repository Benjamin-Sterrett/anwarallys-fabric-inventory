import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { RequireAuth, RequireAdmin } from './RequireAuth';
import { subscribeToAuthState } from '@/lib/firebase/auth';
import { isAdminEmail } from '@/lib/auth/isAdmin';

vi.mock('@/lib/firebase/auth', () => ({
  subscribeToAuthState: vi.fn(),
}));

vi.mock('@/lib/auth/isAdmin', () => ({
  isAdminEmail: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: vi.fn(() => vi.fn()),
  };
});

const fakeUser = (overrides?: Partial<{ email: string; emailVerified: boolean; uid: string }>) => ({
  email: 'staff@fabric.local',
  emailVerified: true,
  uid: 'uid-1',
  ...overrides,
}) as unknown as import('firebase/auth').User;

function renderAt(path: string, ui: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="*" element={ui} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RequireAuth', () => {
  const mockNavigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useNavigate).mockReturnValue(mockNavigate);
  });

  it('redirects signed-out users to /login with encoded continue', async () => {
    vi.mocked(subscribeToAuthState).mockImplementation((cb) => {
      cb(null);
      return vi.fn();
    });

    renderAt(
      '/folders/abc?sort=newest#x',
      <RequireAuth>
        <div data-testid="sentinel">protected</div>
      </RequireAuth>,
    );

    await waitFor(() => {
      expect(screen.queryByTestId('sentinel')).not.toBeInTheDocument();
    });

    expect(mockNavigate).toHaveBeenCalledWith(
      `/login?continue=${encodeURIComponent('/folders/abc?sort=newest#x')}`,
      { replace: true },
    );
  });
});

describe('RequireAdmin', () => {
  const mockNavigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useNavigate).mockReturnValue(mockNavigate);
  });

  it('renders NotAuthorized when signed-in user is not admin or email not verified', async () => {
    // a. signed-in, isAdminEmail returns false → NotAuthorized rendered
    vi.mocked(isAdminEmail).mockReturnValue(false);
    vi.mocked(subscribeToAuthState).mockImplementation((cb) => {
      cb(fakeUser());
      return vi.fn();
    });

    const { unmount: unmountA } = renderAt(
      '/staff',
      <RequireAdmin>
        <div data-testid="sentinel">admin-only</div>
      </RequireAdmin>,
    );

    await waitFor(() => {
      expect(screen.getByText('Admin only')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('sentinel')).not.toBeInTheDocument();
    unmountA();

    // b. signed-in, isAdminEmail returns true, emailVerified: false → NotAuthorized rendered
    vi.mocked(isAdminEmail).mockReturnValue(true);
    vi.mocked(subscribeToAuthState).mockImplementation((cb) => {
      cb(fakeUser({ emailVerified: false }));
      return vi.fn();
    });

    const { unmount: unmountB } = renderAt(
      '/staff',
      <RequireAdmin>
        <div data-testid="sentinel">admin-only</div>
      </RequireAdmin>,
    );

    await waitFor(() => {
      expect(screen.getByText('Admin only')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('sentinel')).not.toBeInTheDocument();
    unmountB();

    // c. signed-in, isAdminEmail returns true, emailVerified: true → sentinel children rendered
    vi.mocked(isAdminEmail).mockReturnValue(true);
    vi.mocked(subscribeToAuthState).mockImplementation((cb) => {
      cb(fakeUser());
      return vi.fn();
    });

    renderAt(
      '/staff',
      <RequireAdmin>
        <div data-testid="sentinel">admin-only</div>
      </RequireAdmin>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('sentinel')).toBeInTheDocument();
    });
    expect(screen.queryByText('Admin only')).not.toBeInTheDocument();
  });
});
