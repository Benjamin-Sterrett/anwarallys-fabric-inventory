// /login — email + password sign-in (PRJ-781).
//
// ─── Continue-param safety ───────────────────────────────────────────────
// `continue` is untrusted user input. Open-redirect protection: accept
// only paths that start with "/" and NOT "//" (which would be a
// protocol-relative URL like //evil.com). Anything else defaults to "/".
// Matters for QR-scan landings: /login?continue=/i/abc123 is fine; an
// attacker-crafted /login?continue=//evil.com is not.
//
// ─── Already-signed-in short-circuit ─────────────────────────────────────
// If the auth state resolves to a non-null User, redirect immediately
// without rendering the form. Avoids the form-flash that happens when an
// authenticated user clicks a /login link or hard-reloads the URL.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FirebaseError } from 'firebase/app';
import { signIn, subscribeToAuthState } from '@/lib/firebase/auth';

// Keep the allow-list narrow. New legitimate redirect targets must opt in
// here (or we extend the predicate); silent permissiveness is the bug we
// are guarding against.
export function sanitizeContinue(raw: string | null): string {
  if (!raw) return '/';
  // Must start with single slash. Reject "//evil.com" (protocol-relative)
  // and anything else (http://, javascript:, etc.).
  if (!raw.startsWith('/')) return '/';
  if (raw.startsWith('//')) return '/';
  // PRJ-877: reject `/login` itself (case-insensitive) followed by
  // `?`, `/`, `#`, or end-of-string. Otherwise an authenticated user
  // hitting `/login?continue=/login` would redirect-loop into the
  // already-signed-in short-circuit and sit on the loading shell forever.
  if (/^\/login(?:[?/#]|$)/i.test(raw)) return '/';
  return raw;
}

// ESL-friendly mapping of Firebase auth error codes. Plain English, no
// raw codes shown to the user. Order matches docs frequency, not alpha.
function messageForError(error: unknown): string {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
        return 'Email or password is wrong. Try again.';
      case 'auth/invalid-email':
        return "That email doesn't look right. Check it and try again.";
      case 'auth/user-disabled':
        return 'This account is turned off. Ask your store admin.';
      case 'auth/too-many-requests':
        return 'Too many sign-in attempts. Wait a few minutes and try again.';
      case 'auth/network-request-failed':
        return "Can't reach the server. Check your internet and try again.";
      case 'auth/missing-password':
        return 'Please enter your password.';
      default:
        return `Could not sign in: ${error.message}`;
    }
  }
  if (error instanceof Error) return `Could not sign in: ${error.message}`;
  return 'Could not sign in. Please try again.';
}

export default function LoginRoute() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const continueTo = useMemo(
    () => sanitizeContinue(searchParams.get('continue')),
    [searchParams],
  );

  const [authResolved, setAuthResolved] = useState(false);
  const [alreadySignedIn, setAlreadySignedIn] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Subscribe to auth state ONCE per mount. If user is already signed in
  // when /login mounts, redirect immediately — never render the form.
  useEffect(() => {
    const unsub = subscribeToAuthState((u) => {
      setAuthResolved(true);
      if (u) {
        setAlreadySignedIn(true);
        navigate(continueTo, { replace: true });
      }
    });
    return unsub;
  }, [continueTo, navigate]);

  const submit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setError(null);
      if (!email.trim()) {
        setError('Please enter your email.');
        return;
      }
      if (!password) {
        setError('Please enter your password.');
        return;
      }
      setSubmitting(true);
      try {
        await signIn(email.trim(), password);
        // Auth state callback above will fire and navigate, but
        // navigate explicitly too for snappy UX (the callback can be
        // up to a turn behind).
        navigate(continueTo, { replace: true });
      } catch (err) {
        setError(messageForError(err));
      } finally {
        setSubmitting(false);
      }
    },
    [email, password, continueTo, navigate],
  );

  // Render nothing while we wait for the first auth callback OR while we
  // navigate away from an already-signed-in user. Avoids form-flash.
  if (!authResolved || alreadySignedIn) {
    return (
      <section className="mx-auto max-w-md px-4 py-10">
        <p className="text-center text-sm text-gray-600">Loading…</p>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-md px-4 py-10">
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h1 className="text-2xl font-semibold text-gray-900">Sign in</h1>
        <p className="mt-1 text-sm text-gray-700">
          Sign in with the email and password your store admin gave you.
        </p>
        <form onSubmit={submit} className="mt-6 space-y-3">
          <label className="block">
            <span className="text-sm font-medium text-gray-800">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              inputMode="email"
              required
              className="mt-1 block w-full min-h-12 rounded-md border border-gray-300 px-3 py-2 text-base"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-800">Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              className="mt-1 block w-full min-h-12 rounded-md border border-gray-300 px-3 py-2 text-base"
            />
          </label>
          {error ? <p className="text-sm text-red-700" role="alert">{error}</p> : null}
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex min-h-12 min-w-12 w-full items-center justify-center rounded-md bg-gray-900 px-5 py-3 text-base font-medium text-white disabled:opacity-50"
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="mt-6 text-center text-xs text-gray-500">
          Your store admin manages staff accounts.
        </p>
      </div>
    </section>
  );
}
