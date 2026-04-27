import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { FirebaseError } from 'firebase/app';
import LoginRoute, { sanitizeContinue } from './login';
import { signIn, subscribeToAuthState } from '@/lib/firebase/auth';

vi.mock('@/lib/firebase/auth', () => ({
  signIn: vi.fn(),
  subscribeToAuthState: vi.fn(),
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

describe('sanitizeContinue', () => {
  it('rejects all unsafe inputs and accepts safe paths', () => {
    const rejectCases = [
      sanitizeContinue(null),
      sanitizeContinue(undefined as unknown as string | null),
      sanitizeContinue(''),
      sanitizeContinue('http://evil.com'),
      sanitizeContinue('https://evil.com'),
      sanitizeContinue('//evil.com'),
      sanitizeContinue('///'),
      sanitizeContinue('javascript:alert(1)'),
      sanitizeContinue('JavaScript:alert(1)'),
      sanitizeContinue('data:text/html,<script>'),
      sanitizeContinue('/login'),
      sanitizeContinue('/login?continue=/'),
      sanitizeContinue('/login/extra'),
      sanitizeContinue('/login#x'),
      sanitizeContinue('/LOGIN'),
    ];
    rejectCases.forEach((result) => {
      expect(result).toBe('/');
    });

    expect(sanitizeContinue('/')).toBe('/');
    expect(sanitizeContinue('/i/abc123')).toBe('/i/abc123');
    expect(sanitizeContinue('/staff')).toBe('/staff');
    expect(sanitizeContinue('/folders/abc?sort=newest')).toBe('/folders/abc?sort=newest');
    expect(sanitizeContinue('/folders/abc?continue=%2Fevil.com')).toBe('/folders/abc?continue=%2Fevil.com');
    expect(sanitizeContinue('/login-help')).toBe('/login-help');
  });
});

describe('LoginRoute', () => {
  const mockNavigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useNavigate).mockReturnValue(mockNavigate);
  });

  it('redirects to /login fallback when continue is unsafe', async () => {
    vi.mocked(subscribeToAuthState).mockImplementation((cb) => {
      cb(null);
      return vi.fn();
    });
    vi.mocked(signIn).mockResolvedValue({ user: fakeUser() } as import('firebase/auth').UserCredential);

    renderAt('/login?continue=//evil.com', <LoginRoute />);

    await waitFor(() => {
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    });

    await userEvent.type(screen.getByLabelText(/email/i), 'staff@fabric.local');
    await userEvent.type(screen.getByLabelText(/password/i), 'secret123');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
    });
  });

  it('signed-in user is short-circuited to continue without rendering form', async () => {
    vi.mocked(subscribeToAuthState).mockImplementation((cb) => {
      cb(fakeUser());
      return vi.fn();
    });

    renderAt('/login?continue=/staff', <LoginRoute />);

    await waitFor(() => {
      expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
    });

    expect(mockNavigate).toHaveBeenCalledWith('/staff', { replace: true });
  });

  it.each([
    ['auth/invalid-credential', 'Email or password is wrong'],
    ['auth/invalid-email', "That email doesn't look right"],
    ['auth/user-disabled', 'This account is turned off'],
    ['auth/too-many-requests', 'Too many sign-in attempts'],
    ['auth/network-request-failed', "Can't reach the server"],
    ['auth/missing-password', 'Please enter your password'],
  ] as const)(
    'failed sign-in surfaces messageForError for %s',
    async (code, expected) => {
      vi.mocked(subscribeToAuthState).mockImplementation((cb) => {
        cb(null);
        return vi.fn();
      });
      vi.mocked(signIn).mockRejectedValue(new FirebaseError(code, 'mock'));

      renderAt('/login', <LoginRoute />);

      await waitFor(() => {
        expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
      });

      await userEvent.type(screen.getByLabelText(/email/i), 'staff@fabric.local');
      await userEvent.type(screen.getByLabelText(/password/i), 'secret123');
      await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

      const alert = await waitFor(() => screen.getByRole('alert'));
      expect(alert).toHaveTextContent(expected);
    },
  );
});
