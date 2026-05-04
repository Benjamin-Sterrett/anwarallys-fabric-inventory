// Self-service password change (PRJ-920).
//
// All signed-in users can change their own password. Re-authentication
// is required before Firebase allows the update. On success the user
// is signed out and redirected to /login so they re-enter with the
// new password.

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { changePassword, signOut } from '@/lib/firebase/auth';
import BackButton from '@/components/BackButton';

const BTN_BASE = 'inline-flex min-h-12 min-w-12 items-center justify-center rounded-md px-5 py-3 text-sm font-medium disabled:opacity-50';
const BTN_PRIMARY = `${BTN_BASE} bg-gray-900 text-white`;
const INPUT = 'mt-1 block w-full min-h-12 rounded-md border border-gray-300 px-3 py-2 text-base';

export default function ChangePasswordRoute() {
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!success) return;
    void signOut().then(() => navigate('/login', { replace: true }));
  }, [success, navigate]);

  const submit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setError(null);

      if (newPassword.length < 6) {
        setError('Password must be at least 6 characters.');
        return;
      }
      if (newPassword !== confirmPassword) {
        setError("Passwords don't match.");
        return;
      }
      if (newPassword === currentPassword) {
        setError('New password must be different from current password.');
        return;
      }

      setSubmitting(true);
      const result = await changePassword(currentPassword, newPassword);
      if (!result.ok) {
        setError(result.error.message);
        setSubmitting(false);
        return;
      }
      setSuccess(true);
      setSubmitting(false);
    },
    [currentPassword, newPassword, confirmPassword],
  );

  return (
    <section className="mx-auto max-w-md px-4 py-10">
      <BackButton />

      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h1 className="text-2xl font-semibold text-gray-900">Change password</h1>
        <p className="mt-1 text-sm text-gray-700">
          Update your password to keep your account secure.
        </p>

        {success ? (
          <div className="mt-6 rounded-md bg-green-50 p-3" role="status">
            <p className="text-sm text-green-800">
              Password updated. Sign in again with your new password.
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-3">
            <label className="block">
              <span className="text-sm font-medium text-gray-800">Current password</span>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                required
                className={INPUT}
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-800">New password</span>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                required
                className={INPUT}
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-800">Confirm new password</span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                required
                className={INPUT}
              />
            </label>
            {error ? (
              <p className="text-sm text-red-700" role="alert">
                {error}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={submitting}
              className={`${BTN_PRIMARY} w-full`}
            >
              {submitting ? 'Updating…' : 'Update password'}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
