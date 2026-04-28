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
// ─── Deactivation guard (PRJ-910) ────────────────────────────────────────
// AuthBar already subscribes to `/users/{uid}`, so it's the natural place
// to detect `isActive == false`. When detected, we set a local `deactivated`
// flag (persists even after sign-out so the toast survives the redirect),
// render a one-time toast banner, and immediately call `signOut()`. The
// real security boundary is still `isActiveStaff()` in Firestore Rules;
// this guard only prevents the confusing "sign in then everything errors"
// UX.
//
// ─── When the bar renders ────────────────────────────────────────────────
// undefined / null → renders nothing. The route guard handles redirects;
// there is no signed-out chrome to display.
// User → renders the bar (with the displayName resolved as above).

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { User as FirebaseUser } from 'firebase/auth';
import { signOut, subscribeToAuthState } from '@/lib/firebase/auth';
import { subscribeToUserByUid, subscribeToAllActiveItems } from '@/lib/queries';
import { isAdminEmail } from '@/lib/auth/isAdmin';

type AuthState = FirebaseUser | null | undefined;

export default function AuthBar() {
  const [authUser, setAuthUser] = useState<AuthState>(undefined);
  const [firestoreDisplayName, setFirestoreDisplayName] = useState<string | null>(null);
  const [deactivated, setDeactivated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [lowStockCount, setLowStockCount] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    const unsub = subscribeToAuthState((u) => setAuthUser(u));
    return unsub;
  }, []);

  // Reset deactivation flag only when a NEW user signs in — NOT on sign-out.
  // This keeps the toast visible after auto-sign-out so the user sees the
  // explanation before the route guard redirects to /login.
  const prevUidRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (authUser?.uid && authUser.uid !== prevUidRef.current) {
      setDeactivated(false);
      prevUidRef.current = authUser.uid;
    }
    if (!authUser) {
      prevUidRef.current = undefined;
    }
  }, [authUser]);

  // Subscribe to the canonical /users/{uid} doc for displayName AND
  // deactivation state. The subscription lives for the lifetime of the
  // signed-in session; an admin flipping `isActive` mid-task fires here
  // within one snapshot round-trip.
  useEffect(() => {
    if (!authUser) {
      setFirestoreDisplayName(null);
      return;
    }
    const unsub = subscribeToUserByUid(
      authUser.uid,
      (user) => {
        if (user && user.isActive === true) {
          setDeactivated(false);
        }
        if (user && user.isActive === false) {
          setDeactivated(true);
          // Preserve admin recovery path: an inactive admin can still reach
          // /staff to reactivate themselves (PRJ-874). Only non-admins are
          // bounced automatically.
          const isAdmin =
            isAdminEmail(authUser.email ?? '') && authUser.emailVerified;
          if (!isAdmin) {
            void signOut();
          }
          return;
        }
        if (user && user.displayName.trim()) {
          setFirestoreDisplayName(user.displayName.trim());
        } else {
          setFirestoreDisplayName(null);
        }
      },
      // Errors are intentionally swallowed: the fallback chain still
      // produces a usable label, and a transient Firestore failure
      // shouldn't break the bar.
      () => {
        setFirestoreDisplayName(null);
      },
    );
    return unsub;
  }, [authUser]);

  // Live low-stock badge count — updates reactively when stock changes.
  useEffect(() => {
    if (!authUser) {
      setLowStockCount(0);
      return;
    }
    const unsub = subscribeToAllActiveItems(
      (items) => {
        const count = items.filter((it) => it.remainingMeters <= it.minimumMeters).length;
        setLowStockCount(count);
      },
      // Errors swallowed: a transient Firestore failure shouldn't break the bar.
      () => {
        setLowStockCount(0);
      },
    );
    return unsub;
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

  const banner = deactivated ? (
    <div data-deactivation-toast className="border-b border-red-200 bg-red-50">
      <div className="mx-auto max-w-5xl px-4 py-3">
        <p className="text-sm font-medium text-red-800">
          Your account has been turned off. Contact your store admin to be
          reactivated.
        </p>
      </div>
    </div>
  ) : null;

  if (!authUser) {
    // Keep the banner visible after auto-sign-out so the user sees the
    // explanation before the route guard redirects to /login.
    return banner || null;
  }

  const label =
    firestoreDisplayName ||
    authUser.displayName?.trim() ||
    authUser.email ||
    'Signed in';

  return (
    <>
      {banner}
      <div data-auth-bar className="border-b border-gray-200 bg-gray-50">
        <div className="mx-auto max-w-5xl px-4 py-2 flex items-center justify-between gap-3">
          <p className="text-sm text-gray-700 truncate">
            Signed in as <span className="font-medium text-gray-900">{label}</span>
          </p>
          <div className="flex items-center gap-2">
            <Link
              to="/lowstock"
              className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-md border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600"
            >
              Low stock
              {lowStockCount > 0 ? (
                <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-xs font-bold text-white">
                  {lowStockCount}
                </span>
              ) : null}
            </Link>
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
    </>
  );
}
