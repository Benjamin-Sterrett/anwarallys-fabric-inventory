import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom';
import ChangePasswordRoute from './change-password';

const mockChangePassword = vi.hoisted(() => vi.fn());
const mockSignOut = vi.hoisted(() => vi.fn());

vi.mock('@/lib/firebase/auth', () => ({
  changePassword: mockChangePassword,
  signOut: mockSignOut,
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: vi.fn(() => vi.fn()),
  };
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="change-password" element={<ChangePasswordRoute />} />
        <Route path="login" element={<div data-testid="login-page">Login</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ChangePasswordRoute', () => {
  const mockNavigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useNavigate).mockReturnValue(mockNavigate);
    mockSignOut.mockResolvedValue(undefined);
  });

  it('happy path: valid current + new password → success message + sign out + redirect', async () => {
    const user = userEvent.setup();
    mockChangePassword.mockResolvedValue({ ok: true, data: undefined });

    renderAt('/change-password');

    await user.type(screen.getByLabelText('Current password'), 'oldpass123');
    await user.type(screen.getByLabelText('New password'), 'newpass123');
    await user.type(screen.getByLabelText('Confirm new password'), 'newpass123');
    await user.click(screen.getByRole('button', { name: /update password/i }));

    await waitFor(() => {
      expect(screen.getByText(/Password updated/i)).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalledTimes(1);
    });
    expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true });
  });

  it('wrong current password → error message, no sign-out', async () => {
    const user = userEvent.setup();
    mockChangePassword.mockResolvedValue({
      ok: false,
      error: { code: 'auth/wrong-password', message: 'Current password is wrong. Try again.' },
    });

    renderAt('/change-password');

    await user.type(screen.getByLabelText('Current password'), 'wrongpass');
    await user.type(screen.getByLabelText('New password'), 'newpass123');
    await user.type(screen.getByLabelText('Confirm new password'), 'newpass123');
    await user.click(screen.getByRole('button', { name: /update password/i }));

    const alert = await waitFor(() => screen.getByRole('alert'));
    expect(alert).toHaveTextContent('Current password is wrong. Try again.');
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('weak new password (< 6 chars) → client-side error, no network call', async () => {
    const user = userEvent.setup();

    renderAt('/change-password');

    await user.type(screen.getByLabelText('Current password'), 'oldpass');
    await user.type(screen.getByLabelText('New password'), '123');
    await user.type(screen.getByLabelText('Confirm new password'), '123');
    await user.click(screen.getByRole('button', { name: /update password/i }));

    const alert = await waitFor(() => screen.getByRole('alert'));
    expect(alert).toHaveTextContent('Password must be at least 6 characters.');
    expect(mockChangePassword).not.toHaveBeenCalled();
  });

  it('mismatched confirm → client-side error', async () => {
    const user = userEvent.setup();

    renderAt('/change-password');

    await user.type(screen.getByLabelText('Current password'), 'oldpass');
    await user.type(screen.getByLabelText('New password'), 'newpass123');
    await user.type(screen.getByLabelText('Confirm new password'), 'different');
    await user.click(screen.getByRole('button', { name: /update password/i }));

    const alert = await waitFor(() => screen.getByRole('alert'));
    expect(alert).toHaveTextContent("Passwords don't match.");
    expect(mockChangePassword).not.toHaveBeenCalled();
  });

  it('same-as-current → client-side error', async () => {
    const user = userEvent.setup();

    renderAt('/change-password');

    await user.type(screen.getByLabelText('Current password'), 'samepass');
    await user.type(screen.getByLabelText('New password'), 'samepass');
    await user.type(screen.getByLabelText('Confirm new password'), 'samepass');
    await user.click(screen.getByRole('button', { name: /update password/i }));

    const alert = await waitFor(() => screen.getByRole('alert'));
    expect(alert).toHaveTextContent('New password must be different from current password.');
    expect(mockChangePassword).not.toHaveBeenCalled();
  });

  it('auth/requires-recent-login server error → correct message', async () => {
    const user = userEvent.setup();
    mockChangePassword.mockResolvedValue({
      ok: false,
      error: { code: 'auth/requires-recent-login', message: 'Sign out and sign back in, then try again.' },
    });

    renderAt('/change-password');

    await user.type(screen.getByLabelText('Current password'), 'oldpass');
    await user.type(screen.getByLabelText('New password'), 'newpass123');
    await user.type(screen.getByLabelText('Confirm new password'), 'newpass123');
    await user.click(screen.getByRole('button', { name: /update password/i }));

    const alert = await waitFor(() => screen.getByRole('alert'));
    expect(alert).toHaveTextContent('Sign out and sign back in, then try again.');
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('auth/network-request-failed server error → correct message', async () => {
    const user = userEvent.setup();
    mockChangePassword.mockResolvedValue({
      ok: false,
      error: { code: 'auth/network-request-failed', message: "Can't reach the server. Check your internet." },
    });

    renderAt('/change-password');

    await user.type(screen.getByLabelText('Current password'), 'oldpass');
    await user.type(screen.getByLabelText('New password'), 'newpass123');
    await user.type(screen.getByLabelText('Confirm new password'), 'newpass123');
    await user.click(screen.getByRole('button', { name: /update password/i }));

    const alert = await waitFor(() => screen.getByRole('alert'));
    expect(alert).toHaveTextContent("Can't reach the server. Check your internet.");
    expect(mockSignOut).not.toHaveBeenCalled();
  });
});
