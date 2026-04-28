// AuthBar — "signed in as X" + sign-out button rendered in the app shell.
//
// Subscribes to auth state so the bar updates immediately when the user
// signs in or out from any other component.
//
// ─── displayName source (PRJ-781 Codex review fix) ────────────────────────
// `/users/{uid}.displayName` is the canonical source. Reasons:
//   - `createStaffUser` writes ONLY the Firestore /users/{uid} doc — it
//     does NOT set Firebase Auth `User.displayName`, so accounts created
//     via /staff would otherwise display their email here.
//   - `renameStaffUser` updates ONLY the Firestore doc — Auth displayName
//     would stay stale forever for renamed accounts.
//   - The bootstrap admin (Console-provisioned per README §sign-in) has
//     no Auth displayName by default either.
// Fallback chain: /users/{uid}.displayName → Auth User.displayName →
// User.email → "Signed in". Firestore is read once per signed-in user
// (cached by uid); a real-time onSnapshot listener is overkill for a
// label that changes via an admin self-service screen.
//
// ─── When the bar renders ────────────────────────────────────────────────
// undefined / null → renders nothing. The route guard handles redirects;
// there is no signed-out chrome to display.
// User → renders the bar (with the displayName resolved as above).

import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { User as FirebaseUser } from 'firebase/auth';
import { signOut, subscribeToAuthState } from '@/lib/firebase/auth';
import { getUserByUid } from '@/lib/queries';
import { isAdminEmail } from '@/lib/auth/isAdmin';

type AuthState = FirebaseUser | null | undefined;

export default function AuthBar() {
  const [authUser, setAuthUser] = useState<AuthState>(undefined);
  const [firestoreDisplayName, setFirestoreDisplayName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const unsub = subscribeToAuthState((u) => setAuthUser(u));
    return unsub;
  }, []);

  // Fetch the canonical displayName once per signed-in user. Errors are
  // intentionally swallowed: the fallback chain still produces a usable
  // label, and a transient Firestore failure shouldn't break the bar.
  useEffect(() => {
    if (!authUser) {
      setFirestoreDisplayName(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const result = await getUserByUid(authUser.uid);
      if (cancelled) return;
      if (result.ok && result.data && result.data.displayName.trim()) {
        setFirestoreDisplayName(result.data.displayName.trim());
      } else {
        setFirestoreDisplayName(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authUser]);

  const handleSignOut = useCallback(async () => {
    // eslint-disable-next-line no-alert -- v1: simple confirm matches /staff page pattern.
    const ok = window.confirm(
      "Sign out? You'll need to sign in again to make changes.",
    );
    if (!ok) return;
    setSignOutError(null);
    setBusy(true);
    try {
      await signOut();
      // signOut() propagates to subscribers and the route guard would
      // also redirect, but navigate explicitly so the UX feels intentional
      // (and we avoid a brief render of the previous page during the
      // auth-state propagation turn).
      navigate('/login', { replace: true });
    } catch (err) {
      // Surface failures inline so staff don't think they're signed out
      // when their session is still active. (PRJ-781 Codex LOW.)
      setSignOutError(
        `Could not sign out: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setBusy(false);
    }
  }, [navigate]);

  if (!authUser) return null;

  const label =
    firestoreDisplayName ||
    authUser.displayName?.trim() ||
    authUser.email ||
    'Signed in';

  return (
    <div data-auth-bar className="border-b border-gray-200 bg-gray-50">
      <div className="mx-auto max-w-5xl px-4 py-2 flex items-center justify-between gap-3">
        <p className="text-sm text-gray-700 truncate">
          Signed in as <span className="font-medium text-gray-900">{label}</span>
        </p>
        <div className="flex items-center gap-2">
          {isAdminEmail(authUser.email) && authUser.emailVerified ? (
            <Link
              to="/staff"
              className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-md border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600"
            >
              Staff
            </Link>
          ) : null}
          <button
            type="button"
            onClick={handleSignOut}
            disabled={busy}
            className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-800 disabled:opacity-50"
          >
            {busy ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </div>
      {signOutError ? (
        <div className="mx-auto max-w-5xl px-4 pb-2">
          <p className="text-sm text-red-700">{signOutError}</p>
        </div>
      ) : null}
    </div>
  );
}
