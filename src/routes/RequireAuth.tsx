// Route guards consumed by the router. Two flavors:
//
//   <RequireAuth>{children}</RequireAuth>
//     Renders children only when the user is signed in. Unauthenticated →
//     redirect to /login?continue=<current path>.
//
//   <RequireAdmin>{children}</RequireAdmin>
//     Renders children only when the user is signed in AND matches the
//     admin email AND has emailVerified === true. Mirrors the staff page's
//     two-layer admin gate (parity with `firestore.rules` `isAdminUser()`).
//
// ─── Three auth states ────────────────────────────────────────────────────
//   `undefined` → first onAuthStateChanged callback hasn't fired yet.
//                 Render <LoadingShell />. Treating this as "signed out"
//                 causes a login flash on every hard reload of an
//                 authenticated user.
//   `null`      → resolved as not signed in. Redirect.
//   `User`      → resolved as signed in. Render.
//
// ─── Why the redirect lives in useEffect ──────────────────────────────────
// React-router's useNavigate cannot be called during render. We schedule
// the navigation in an effect and render <LoadingShell /> for that one
// frame. The effect dep includes the resolved auth state so a sign-out
// during the page lifetime triggers a fresh redirect.
//
// ─── Why each guard subscribes independently ──────────────────────────────
// `<AuthBar>` also subscribes. Firebase Auth's `onAuthStateChanged`
// delivers the same cached state to every subscriber synchronously after
// initial resolution — there is no extra network round-trip. Lifting this
// into a shared Context provider is a future cleanup, not a v1 blocker.

import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { User as FirebaseUser } from 'firebase/auth';
import { subscribeToAuthState } from '@/lib/firebase/auth';
import { isAdminEmail } from '@/lib/auth/isAdmin';

type AuthState = FirebaseUser | null | undefined;

function LoadingShell() {
  return (
    <section className="mx-auto max-w-xl px-4 py-10">
      <p className="text-center text-sm text-gray-600">Loading…</p>
    </section>
  );
}

function NotAuthorized({ reason }: { reason: string }) {
  return (
    <section className="mx-auto max-w-xl px-4 py-10">
      <div className="rounded-lg border border-gray-200 bg-white p-6 text-center">
        <h1 className="text-2xl font-semibold text-gray-900">Admin only</h1>
        <p className="mt-2 text-sm text-gray-700">{reason}</p>
        <Link
          to="/"
          className="mt-6 inline-flex min-h-12 min-w-12 items-center justify-center rounded-md bg-gray-900 px-5 py-3 text-sm font-medium text-white"
        >
          Go to the home page
        </Link>
      </div>
    </section>
  );
}

interface RequireAuthProps {
  children: ReactNode;
}

export function RequireAuth({ children }: RequireAuthProps) {
  const [authUser, setAuthUser] = useState<AuthState>(undefined);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const unsub = subscribeToAuthState((u) => setAuthUser(u));
    return unsub;
  }, []);

  useEffect(() => {
    if (authUser === null) {
      // Preserve search + hash so a deep-linked path with query params
      // (e.g. /folders/abc?sort=newest) round-trips through sign-in.
      const here = `${location.pathname}${location.search}${location.hash}`;
      const continueParam = encodeURIComponent(here);
      navigate(`/login?continue=${continueParam}`, { replace: true });
    }
  }, [authUser, navigate, location]);

  if (authUser === undefined) return <LoadingShell />;
  if (authUser === null) return <LoadingShell />;
  return <>{children}</>;
}

interface RequireAdminProps {
  children: ReactNode;
}

export function RequireAdmin({ children }: RequireAdminProps) {
  const [authUser, setAuthUser] = useState<AuthState>(undefined);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const unsub = subscribeToAuthState((u) => setAuthUser(u));
    return unsub;
  }, []);

  useEffect(() => {
    if (authUser === null) {
      const here = `${location.pathname}${location.search}${location.hash}`;
      const continueParam = encodeURIComponent(here);
      navigate(`/login?continue=${continueParam}`, { replace: true });
    }
  }, [authUser, navigate, location]);

  if (authUser === undefined) return <LoadingShell />;
  if (authUser === null) return <LoadingShell />;
  if (!isAdminEmail(authUser.email) || !authUser.emailVerified) {
    return <NotAuthorized reason="You are not the admin. Only the admin can manage staff." />;
  }
  return <>{children}</>;
}
