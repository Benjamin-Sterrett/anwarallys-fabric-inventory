// /staff — admin-only self-service staff management (PRJ-856 / PRJ-871).
//
// ─── Two-layer admin gate ────────────────────────────────────────────────
// 1. Client (this file): `isAdminEmail(user.email) && user.emailVerified`.
//    Purpose is UX only — show the right page to the right person and avoid
//    a Firestore round-trip just to learn "not allowed". Client gates are
//    NEVER security; a hostile client can edit the bundle.
// 2. Server (`firestore.rules` `isAdminUser()`): the real authz. Compares
//    `request.auth.token.email` to `/config/admin.adminEmail` AND requires
//    `request.auth.token.email_verified == true`. Every write the page
//    issues passes through these Rules.
//
// We mirror BOTH conditions client-side so we don't render a working-looking
// UI to an unverified admin only to have every action fail with
// `permission-denied`. PRJ-873 will durably fix the email-casing parity in
// Rules; today the working assumption is `/config/admin.adminEmail` is
// always lowercase and `isAdminEmail()` lowercases both sides defensively.
//
// ─── Auth state contract ─────────────────────────────────────────────────
//   `authUser === undefined` → still loading first auth callback. Render
//      a loading shell, do not redirect.
//   `authUser === null`      → not signed in. Render "Admin only" + link
//      to `/`.
//   `authUser` is a User but not admin or not verified → "Admin only" +
//      link to `/`.
//   admin + verified → render the staff manager.
//
// Mobile-first per CLAUDE.md UX rules: 48x48 minimum touch targets
// (`min-h-12 min-w-12`). ESL-friendly copy: short sentences, plain English.
// Errors surfaced inline; never silent.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { User as FirebaseUser } from 'firebase/auth';
import { subscribeToAuthState } from '@/lib/firebase/auth';
import { isAdminEmail } from '@/lib/auth/isAdmin';
import {
  createStaffUser,
  deactivateStaffUser,
  listActiveStaff,
  listInactiveStaff,
  reactivateStaffUser,
  renameStaffUser,
} from '@/lib/queries';
import type { User } from '@/lib/models';

type AuthState = FirebaseUser | null | undefined;

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

function LoadingShell() {
  return (
    <section className="mx-auto max-w-xl px-4 py-10">
      <p className="text-center text-sm text-gray-600">Loading…</p>
    </section>
  );
}

// `Could not …` prefix beats "Failed to …" for ESL clarity. Used by every
// inline error string below.

interface AddStaffFormProps {
  adminUid: string;
  onAdded: () => void;
}

function AddStaffForm({ adminUid, onAdded }: AddStaffFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setError(null);
      if (!email.trim() || !password || !displayName.trim()) {
        setError('Please fill in email, password, and display name.');
        return;
      }
      setSubmitting(true);
      // createStaffUser uses a transient secondary Firebase Auth instance
      // internally so calling it does NOT replace the admin's session. Do
      // not re-implement that here — see queries/users.ts header.
      const result = await createStaffUser({
        email: email.trim(),
        password,
        displayName: displayName.trim(),
        adminUid,
      });
      setSubmitting(false);
      if (!result.ok) {
        setError(`Could not add staff: ${result.error.message} (${result.error.code})`);
        return;
      }
      setEmail('');
      setPassword('');
      setDisplayName('');
      onAdded();
    },
    [email, password, displayName, adminUid, onAdded],
  );

  return (
    <form onSubmit={submit} className="rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="text-lg font-semibold text-gray-900">Add staff</h2>
      <p className="mt-1 text-sm text-gray-600">
        New staff can sign in with the email and password you set here.
      </p>
      <div className="mt-4 space-y-3">
        <label className="block">
          <span className="text-sm font-medium text-gray-800">Display name</span>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            autoComplete="off"
            className="mt-1 block w-full min-h-12 rounded-md border border-gray-300 px-3 py-2 text-base"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-gray-800">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="off"
            className="mt-1 block w-full min-h-12 rounded-md border border-gray-300 px-3 py-2 text-base"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-gray-800">
            Password (at least 6 characters)
          </span>
          {/*
            type="password" + autoComplete="new-password" so the value is
            masked on shared phones/tablets and the device password manager
            doesn't autofill the admin's own credentials into the new-staff
            field. A reveal toggle can land in a follow-up if admin asks.
          */}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            className="mt-1 block w-full min-h-12 rounded-md border border-gray-300 px-3 py-2 text-base"
          />
        </label>
      </div>
      {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
      <button
        type="submit"
        disabled={submitting}
        className="mt-4 inline-flex min-h-12 min-w-12 items-center justify-center rounded-md bg-gray-900 px-5 py-3 text-sm font-medium text-white disabled:opacity-50"
      >
        {submitting ? 'Adding…' : 'Add staff'}
      </button>
    </form>
  );
}

interface ActiveStaffRowProps {
  staff: User;
  adminUid: string;
  onChanged: () => void;
}

function ActiveStaffRow({ staff, adminUid, onChanged }: ActiveStaffRowProps) {
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(staff.displayName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveRename = useCallback(async () => {
    setError(null);
    if (!newName.trim()) {
      setError('Display name cannot be empty.');
      return;
    }
    setBusy(true);
    const result = await renameStaffUser(staff.uid, newName.trim(), adminUid);
    setBusy(false);
    if (!result.ok) {
      setError(`Could not rename: ${result.error.message} (${result.error.code})`);
      return;
    }
    setRenaming(false);
    onChanged();
  }, [newName, staff.uid, adminUid, onChanged]);

  const deactivate = useCallback(async () => {
    setError(null);
    // eslint-disable-next-line no-alert -- v1: simple confirm; richer modal lands later.
    const ok = window.confirm(
      `Turn off staff "${staff.displayName}"? They will no longer appear in the staff list.`,
    );
    if (!ok) return;
    setBusy(true);
    const result = await deactivateStaffUser(staff.uid, adminUid);
    setBusy(false);
    if (!result.ok) {
      setError(`Could not turn off: ${result.error.message} (${result.error.code})`);
      return;
    }
    onChanged();
  }, [staff.uid, staff.displayName, adminUid, onChanged]);

  return (
    <li className="rounded-lg border border-gray-200 bg-white p-4">
      {renaming ? (
        <div className="space-y-3">
          <label className="block">
            <span className="text-sm font-medium text-gray-800">New display name</span>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              autoComplete="off"
              className="mt-1 block w-full min-h-12 rounded-md border border-gray-300 px-3 py-2 text-base"
            />
          </label>
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={saveRename}
              disabled={busy}
              className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-md bg-gray-900 px-5 py-3 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => {
                setRenaming(false);
                setNewName(staff.displayName);
                setError(null);
              }}
              disabled={busy}
              className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-md border border-gray-300 px-5 py-3 text-sm font-medium text-gray-800 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-base font-semibold text-gray-900">{staff.displayName}</p>
            <p className="text-sm text-gray-600">{staff.email}</p>
            {error ? <p className="mt-1 text-sm text-red-700">{error}</p> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setRenaming(true)}
              disabled={busy}
              className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-md border border-gray-300 px-4 py-3 text-sm font-medium text-gray-800 disabled:opacity-50"
            >
              Rename
            </button>
            <button
              type="button"
              onClick={deactivate}
              disabled={busy}
              className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-md border border-red-300 px-4 py-3 text-sm font-medium text-red-700 disabled:opacity-50"
            >
              Turn off
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

interface InactiveStaffRowProps {
  staff: User;
  adminUid: string;
  onChanged: () => void;
}

function InactiveStaffRow({ staff, adminUid, onChanged }: InactiveStaffRowProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reactivate has NO confirm dialog by design: it is a recovery action
  // for an accidental "Turn off". Asking "Are you sure?" on an undo would
  // feel pessimistic and the action is fully reversible by clicking
  // "Turn off" again. (PRJ-856 Codex round-3 finding: this row exists so
  // accidental deactivation is recoverable in-app, no Console required.)
  const reactivate = useCallback(async () => {
    setError(null);
    setBusy(true);
    const result = await reactivateStaffUser(staff.uid, adminUid);
    setBusy(false);
    if (!result.ok) {
      setError(`Could not turn on: ${result.error.message} (${result.error.code})`);
      return;
    }
    onChanged();
  }, [staff.uid, adminUid, onChanged]);

  return (
    <li className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-base font-semibold text-gray-900">{staff.displayName}</p>
          <p className="text-sm text-gray-600">{staff.email}</p>
          <p className="mt-1 text-xs text-gray-500">Turned off</p>
          {error ? <p className="mt-1 text-sm text-red-700">{error}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={reactivate}
            disabled={busy}
            className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-md bg-gray-900 px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? 'Turning on…' : 'Turn on'}
          </button>
        </div>
      </div>
    </li>
  );
}

interface StaffManagerProps {
  adminUid: string;
  adminEmail: string;
}

function StaffManager({ adminUid, adminEmail }: StaffManagerProps) {
  const [activeStaff, setActiveStaff] = useState<User[] | null>(null);
  const [inactiveStaff, setInactiveStaff] = useState<User[] | null>(null);
  const [activeError, setActiveError] = useState<string | null>(null);
  const [inactiveError, setInactiveError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setActiveError(null);
    setInactiveError(null);
    // Two independent reads — surfacing each error separately means a
    // partial failure (e.g. transient permission glitch on one query)
    // doesn't blank both lists.
    const [activeResult, inactiveResult] = await Promise.all([
      listActiveStaff(),
      listInactiveStaff(),
    ]);
    setLoading(false);
    // Filter the admin's own /users doc out of BOTH lists. README §122
    // bootstraps a /users/{adminUid} record so the admin can write
    // movements (movements rules require actorName == /users/{auth.uid}.
    // displayName, PRJ-859). If we let the admin appear in this UI they
    // could "Turn off" themselves, which flips isActive=false and
    // immediately revokes inventory reads/writes for the only admin —
    // /staff itself stays open (admin gate is /config/admin.adminEmail,
    // not isActive) but the rest of the app goes dark. Recovery would
    // require Firebase Console access. Defense-in-depth: also exclude
    // from the inactive list so a manually-edited admin doc never
    // surfaces a "Turn on" button on themselves either.
    if (activeResult.ok) {
      setActiveStaff(activeResult.data.filter((u) => u.uid !== adminUid));
    } else {
      setActiveStaff(null);
      setActiveError(
        `Could not load active staff: ${activeResult.error.message} (${activeResult.error.code})`,
      );
    }
    if (inactiveResult.ok) {
      setInactiveStaff(inactiveResult.data.filter((u) => u.uid !== adminUid));
    } else {
      setInactiveStaff(null);
      setInactiveError(
        `Could not load turned-off staff: ${inactiveResult.error.message} (${inactiveResult.error.code})`,
      );
    }
  }, [adminUid]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <section className="mx-auto max-w-2xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Staff</h1>
        <p className="mt-1 text-sm text-gray-700">
          Add, rename, turn off, or turn back on staff who can adjust stock.
        </p>
      </header>

      <div className="space-y-6">
        <AddStaffForm adminUid={adminUid} onAdded={refresh} />

        <div>
          <h2 className="text-lg font-semibold text-gray-900">Active staff</h2>
          {loading ? (
            <p className="mt-2 text-sm text-gray-600">Loading…</p>
          ) : activeError ? (
            <p className="mt-2 text-sm text-red-700">{activeError}</p>
          ) : !activeStaff || activeStaff.length === 0 ? (
            <p className="mt-2 text-sm text-gray-600">
              No active staff yet. Add your first staff member above.
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              {activeStaff.map((s) => (
                <ActiveStaffRow
                  key={s.uid}
                  staff={s}
                  adminUid={adminUid}
                  onChanged={refresh}
                />
              ))}
            </ul>
          )}
        </div>

        <div>
          <h2 className="text-lg font-semibold text-gray-900">Turned-off staff</h2>
          <p className="mt-1 text-sm text-gray-600">
            Staff you turned off. Click "Turn on" to let them sign in again.
          </p>
          {loading ? (
            <p className="mt-2 text-sm text-gray-600">Loading…</p>
          ) : inactiveError ? (
            <p className="mt-2 text-sm text-red-700">{inactiveError}</p>
          ) : !inactiveStaff || inactiveStaff.length === 0 ? (
            <p className="mt-2 text-sm text-gray-600">
              No turned-off staff.
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              {inactiveStaff.map((s) => (
                <InactiveStaffRow
                  key={s.uid}
                  staff={s}
                  adminUid={adminUid}
                  onChanged={refresh}
                />
              ))}
            </ul>
          )}
        </div>

        <p className="pt-4 text-center text-xs text-gray-500">Admin: {adminEmail}</p>
      </div>
    </section>
  );
}

export default function StaffRoute() {
  const [authUser, setAuthUser] = useState<AuthState>(undefined);

  useEffect(() => {
    const unsub = subscribeToAuthState((u) => setAuthUser(u));
    return unsub;
  }, []);

  const adminEmailEnv = useMemo(
    () => (import.meta.env.VITE_ADMIN_EMAIL ?? '').toString(),
    [],
  );

  if (authUser === undefined) return <LoadingShell />;
  if (authUser === null) {
    return <NotAuthorized reason="You must sign in as the admin to manage staff." />;
  }
  if (!isAdminEmail(authUser.email) || !authUser.emailVerified) {
    return (
      <NotAuthorized reason="You are not the admin. Only the admin can manage staff." />
    );
  }

  return <StaffManager adminUid={authUser.uid} adminEmail={adminEmailEnv} />;
}
