// AppNav — the branded, responsive navigation shell. Replaces the old
// horizontal <AuthBar>. It OWNS every behavior the AuthBar had (ported
// verbatim below) and renders two layouts from ONE nav-item source:
//   • desktop web (≥ lg): a persistent left <Sidebar>
//   • phone/tablet (< lg): a slim <TopBar> whose ☰ opens a <Drawer>
//
// ─── Ported behaviors (PRESERVE — see AuthBar history) ────────────────────
// displayName fallback (PRJ-781): /users/{uid}.displayName → Auth displayName
//   → email → "Signed in".
// Deactivation guard (PRJ-910): subscribe /users/{uid}; isActive===false sets
//   a `deactivated` banner and auto-signs-out NON-admins only (admins keep the
//   /staff recovery path). The banner persists after sign-out until a NEW uid
//   signs in.
// Live low-stock count: subscribeToAllActiveItems → count remainingMeters <=
//   minimumMeters; reflected in both layouts.
// Sign-out: window.confirm gate → busy → signOut() → navigate('/login') with
//   inline signOutError on failure.
// When !authUser: render ONLY the banner (or null) — no nav chrome. The route
//   guard handles redirects.
//
// The wrapper renders `children` (the routed <main><Outlet/></main>) inside the
// content column so the Sidebar and content sit in one `lg:flex` row while the
// banner + TopBar span full width above it.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { User as FirebaseUser } from 'firebase/auth';
import { signOut, subscribeToAuthState } from '@/lib/firebase/auth';
import { subscribeToUserByUid, subscribeToAllActiveItems } from '@/lib/queries';
import { isAdminEmail } from '@/lib/auth/isAdmin';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import Drawer from './Drawer';

type AuthState = FirebaseUser | null | undefined;

export default function AppNav({ children }: { children?: ReactNode }) {
  const [authUser, setAuthUser] = useState<AuthState>(undefined);
  const [firestoreDisplayName, setFirestoreDisplayName] = useState<string | null>(null);
  const [deactivated, setDeactivated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();
  const location = useLocation();

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
  // deactivation state (an admin flipping `isActive` mid-task fires here
  // within one snapshot round-trip).
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
      // Errors are intentionally swallowed: the fallback chain still produces
      // a usable label, and a transient Firestore failure shouldn't break nav.
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
      // Errors swallowed: a transient Firestore failure shouldn't break nav.
      () => {
        setLowStockCount(0);
      },
    );
    return unsub;
  }, [authUser]);

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    // Return focus to the ☰ that opened the drawer (a11y).
    hamburgerRef.current?.focus();
  }, []);

  // Close the drawer on route change (item tap also calls onNavigate, but a
  // programmatic navigate — e.g. sign-out — is covered here too).
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

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
      // signOut() propagates to subscribers and the route guard would also
      // redirect, but navigate explicitly so the UX feels intentional (and we
      // avoid a brief render of the previous page during propagation).
      navigate('/login', { replace: true });
    } catch (err) {
      // Surface failures inline so staff don't think they're signed out when
      // their session is still active. (PRJ-781 Codex LOW.)
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
    // explanation before the route guard redirects to /login. `children`
    // (the routed page, e.g. /login) still renders below it.
    return (
      <>
        {banner}
        {children}
      </>
    );
  }

  const label =
    firestoreDisplayName ||
    authUser.displayName?.trim() ||
    authUser.email ||
    'Signed in';

  const isAdmin = isAdminEmail(authUser.email) && authUser.emailVerified;

  return (
    <>
      {banner}
      <TopBar
        ref={hamburgerRef}
        lowStockCount={lowStockCount}
        onOpenMenu={() => setDrawerOpen(true)}
        drawerOpen={drawerOpen}
      />
      <Drawer
        open={drawerOpen}
        onClose={closeDrawer}
        label={label}
        lowStockCount={lowStockCount}
        isAdmin={isAdmin}
        onSignOut={handleSignOut}
        signingOut={busy}
        signOutError={signOutError}
      />
      <div className="flex-1 lg:flex lg:min-h-0">
        <Sidebar
          label={label}
          lowStockCount={lowStockCount}
          isAdmin={isAdmin}
          onSignOut={handleSignOut}
          signingOut={busy}
          signOutError={signOutError}
        />
        <div className="flex min-w-0 flex-1 flex-col">{children}</div>
      </div>
    </>
  );
}
