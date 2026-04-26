// Stock adjustment route (PRJ-787) — only consumer of
// `createMovementAndAdjustItem`. Boundary owns invariants (actor non-empty,
// meters finite/non-neg, zero-delta rejection, optimistic concurrency, error
// sentinels). UI translates user intent → params and Result → UI states.
// Modal/snackbar/chips inlined; PRJ-791 extracts modal, PRJ-788 polishes chips.
// `actorName` MUST come from /users/{uid}.displayName — Auth profile is stale
// (PRJ-876). Out of scope: movement history (PRJ-789), QR deep-link (PRJ-792).

import {
  useCallback, useEffect, useMemo, useRef, useState,
  type CSSProperties, type PointerEvent as ReactPointerEvent,
} from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { User as FirebaseUser } from 'firebase/auth';
import { subscribeToAuthState } from '@/lib/firebase/auth';
import { createMovementAndAdjustItem, getItemById, getUserByUid } from '@/lib/queries';
import type { MovementReason, RollItem, User } from '@/lib/models';

const HOLD_MS = 800;
const STEP_DELAY_MS = 500;
const STEP_INTERVAL_MS = 100;
const STEP_NUDGE = 0.5;
const NOTE_MAX = 200;
const NOTE_MIN_OTHER = 3;
const SAVE_TIMEOUT_MS = 10_000;
const UNDO_WINDOW_MS = 15_000;

const REASONS: ReadonlyArray<{ value: MovementReason; label: string }> = [
  { value: 'sold', label: 'Sold' }, { value: 'cut', label: 'Cut' },
  { value: 'damage', label: 'Damage' }, { value: 'return', label: 'Return' },
  { value: 'correction', label: 'Correction' }, { value: 'receive', label: 'Receive' },
  { value: 'other', label: 'Other' },
];

const BTN_BASE = 'inline-flex min-h-12 min-w-12 items-center justify-center rounded-md px-5 py-3 text-sm font-medium disabled:opacity-50';
const BTN_PRIMARY = `${BTN_BASE} bg-gray-900 text-white`;
const BTN_SECONDARY = `${BTN_BASE} border border-gray-300 text-gray-800`;
const INPUT = 'mt-1 block w-full min-h-12 rounded-md border border-gray-300 px-3 py-2 text-base';

type Tab = 'sold' | 'exact';

// Strict allowlist: accepts `.` or `,` decimal; rejects sign, exponent, NaN,
// whitespace, multi-decimal. ESL `9,5` parses; `-3` and `9..5` rejected.
function parseDecimalLocale(raw: string): number | null {
  const s = raw.trim();
  if (s === '' || !/^[0-9]+([.,][0-9]+)?$/.test(s)) return null;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function formatMeters(n: number): string {
  if (!Number.isFinite(n)) return '–';
  const r = Math.round(n * 100) / 100;
  return `${r} m`;
}

function mapErrorCode(code: string, fallback: string): string {
  switch (code) {
    case 'item-missing': return 'This roll is missing or has been deleted. Refresh and try again.';
    case 'meters-mismatch': return 'Stock changed in another session. Refresh and retry.';
    case 'invalid-meters': return 'The meters value is not valid. Check the number and try again.';
    case 'zero-delta': return 'No change to save.';
    case 'invalid-actor': return 'You are not signed in. Sign in and try again.';
    case 'firestore/permission-denied': return 'You do not have permission to save this change.';
    case 'firestore/unavailable': return 'You appear to be offline. Reconnect and try again.';
    case 'firestore/aborted': return 'Another save happened first. Refresh and retry.';
    case 'timeout': return 'Save took too long. Check your internet and retry.';
    default: return `${fallback} (${code})`;
  }
}

function useOnline(): boolean {
  const [online, setOnline] = useState<boolean>(() => typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true); const down = () => setOnline(false);
    window.addEventListener('online', up); window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);
  return online;
}

// Press for HOLD_MS to fire `onConfirm`. Release early cancels — no fire.
// Disabled state suppresses interactions. The 800ms commitment is the second
// guard against accidental double-saves; first is `submitting` flag on Save.
function HoldToConfirm({ label, onConfirm, disabled }: { label: string; onConfirm: () => void; disabled?: boolean }) {
  const [progress, setProgress] = useState(0);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const firedRef = useRef(false);

  const cleanup = useCallback(() => {
    if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    startRef.current = null;
  }, []);
  useEffect(() => () => cleanup(), [cleanup]);

  const tick = useCallback(() => {
    if (startRef.current === null) return;
    const p = Math.min(1, (performance.now() - startRef.current) / HOLD_MS);
    setProgress(p);
    if (p >= 1) {
      if (!firedRef.current) { firedRef.current = true; cleanup(); onConfirm(); }
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [cleanup, onConfirm]);

  const start = useCallback((e: ReactPointerEvent<HTMLButtonElement>) => {
    if (disabled || firedRef.current) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    startRef.current = performance.now();
    setProgress(0);
    rafRef.current = requestAnimationFrame(tick);
  }, [disabled, tick]);

  const cancel = useCallback(() => {
    if (firedRef.current) return;
    cleanup(); setProgress(0);
  }, [cleanup]);

  const RADIUS = 28;
  const CIRC = 2 * Math.PI * RADIUS;
  const dashOffset = CIRC * (1 - progress);
  const ringStyle: CSSProperties = { transition: progress === 0 ? 'stroke-dashoffset 200ms ease-out' : 'none' };

  return (
    <button
      type="button" disabled={disabled}
      onPointerDown={start} onPointerUp={cancel} onPointerCancel={cancel} onPointerLeave={cancel}
      className="relative flex w-full items-center justify-center gap-3 rounded-md bg-gray-900 px-6 py-5 text-base font-semibold text-white disabled:opacity-50"
      aria-label={`Hold to confirm: ${label}`}
    >
      <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="32" cy="32" r={RADIUS} stroke="rgba(255,255,255,0.25)" strokeWidth="4" fill="none" />
        <circle cx="32" cy="32" r={RADIUS} stroke="white" strokeWidth="4" fill="none"
          strokeDasharray={CIRC} strokeDashoffset={dashOffset} strokeLinecap="round"
          transform="rotate(-90 32 32)" style={ringStyle} />
      </svg>
      <span>{progress > 0 && progress < 1 ? 'Hold…' : label}</span>
    </button>
  );
}

function AdjustPage({ itemId }: { itemId: string }) {
  const navigate = useNavigate();
  const online = useOnline();

  const [authUser, setAuthUser] = useState<FirebaseUser | null | undefined>(undefined);
  useEffect(() => subscribeToAuthState((u) => setAuthUser(u)), []);

  const [item, setItem] = useState<RollItem | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const reloadItem = useCallback(() => {
    setItem(undefined); setLoadError(null);
    void getItemById(itemId).then((r) => {
      if (!r.ok) { setItem(null); setLoadError(`Could not load item: ${r.error.message} (${r.error.code})`); return; }
      if (!r.data) { setItem(null); setLoadError('That item is missing or has been deleted.'); return; }
      setItem(r.data);
    });
  }, [itemId]);
  useEffect(() => { if (authUser !== undefined) reloadItem(); }, [authUser, reloadItem]);

  // Security Rules require actorName == /users/{uid}.displayName; Auth
  // profile displayName is stale (PRJ-876), so fetch the Firestore doc.
  const [userDoc, setUserDoc] = useState<User | null | undefined>(undefined);
  const [userError, setUserError] = useState<string | null>(null);
  useEffect(() => {
    if (!authUser) { setUserDoc(authUser === null ? null : undefined); return; }
    setUserDoc(undefined); setUserError(null);
    void getUserByUid(authUser.uid).then((r) => {
      if (!r.ok) { setUserDoc(null); setUserError(`Could not load your profile: ${r.error.message} (${r.error.code})`); return; }
      if (!r.data) { setUserDoc(null); setUserError('Your staff profile is missing. Ask the admin to add you on the Staff page.'); return; }
      setUserDoc(r.data);
    });
  }, [authUser]);

  const [tab, setTab] = useState<Tab>('sold');
  const [metersInput, setMetersInput] = useState('');
  const [reason, setReason] = useState<MovementReason | null>(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [snack, setSnack] = useState<string | null>(null);
  const [lastMovement, setLastMovement] = useState<{ movementId: string; oldMeters: number; newMeters: number } | null>(null);

  useEffect(() => {
    if (!lastMovement) return;
    const t = window.setTimeout(() => { setLastMovement(null); setSnack(null); }, UNDO_WINDOW_MS);
    return () => window.clearTimeout(t);
  }, [lastMovement]);

  // Snackbar-only auto-dismiss (lead Codex P3). The lastMovement effect
  // covers Save success (15-sec window). After Undo clears lastMovement
  // the "Undone." banner has no other timer, so it would stick until the
  // next action. 4 sec for snack-only states.
  useEffect(() => {
    if (!snack || lastMovement) return;
    const t = window.setTimeout(() => setSnack(null), 4000);
    return () => window.clearTimeout(t);
  }, [snack, lastMovement]);

  const repeatRef = useRef<{ delay: number | null; interval: number | null }>({ delay: null, interval: null });
  const stopRepeat = useCallback(() => {
    if (repeatRef.current.delay !== null) { window.clearTimeout(repeatRef.current.delay); repeatRef.current.delay = null; }
    if (repeatRef.current.interval !== null) { window.clearInterval(repeatRef.current.interval); repeatRef.current.interval = null; }
  }, []);
  useEffect(() => () => stopRepeat(), [stopRepeat]);

  const parsed = useMemo(() => parseDecimalLocale(metersInput), [metersInput]);

  // Sold tab: subtract input from on-hand. Exact tab: input IS the new on-hand.
  const targetNewMeters = useMemo<number | null>(() => {
    if (parsed === null || !item) return null;
    if (tab === 'sold') {
      const next = item.remainingMeters - parsed;
      return Number.isFinite(next) ? next : null;
    }
    return parsed;
  }, [parsed, tab, item]);

  const delta = useMemo<number | null>(
    () => targetNewMeters === null || !item ? null : targetNewMeters - item.remainingMeters,
    [targetNewMeters, item],
  );

  const previewValid = targetNewMeters !== null && targetNewMeters >= 0 && delta !== 0;
  const noteTrimmed = note.trim();
  const noteValid = reason !== 'other' || (noteTrimmed.length >= NOTE_MIN_OTHER && noteTrimmed.length <= NOTE_MAX);
  const saveEnabled = online && previewValid && reason !== null && noteValid && !submitting && !!item && !!userDoc;

  const stepBy = useCallback((amount: number) => {
    setMetersInput((cur) => {
      const n = parseDecimalLocale(cur) ?? 0;
      return String(Math.max(0, Math.round((n + amount) * 100) / 100));
    });
  }, []);
  const startStep = useCallback((amount: number) => {
    stopRepeat();
    stepBy(amount);
    repeatRef.current.delay = window.setTimeout(() => {
      repeatRef.current.interval = window.setInterval(() => stepBy(amount), STEP_INTERVAL_MS);
    }, STEP_DELAY_MS);
  }, [stopRepeat, stepBy]);

  const onTab = useCallback((next: Tab) => { setTab(next); setMetersInput(''); setSubmitError(null); }, []);

  const onSavePressed = useCallback(() => {
    setSubmitError(null);
    if (saveEnabled) setConfirmOpen(true);
  }, [saveEnabled]);

  const onConfirm = useCallback(async () => {
    if (!item || !authUser || !userDoc || targetNewMeters === null || reason === null) return;
    setSubmitting(true); setSubmitError(null);
    const params = {
      itemId: item.itemId,
      expectedOldMeters: item.remainingMeters,
      newMeters: targetNewMeters,
      reason,
      note: reason === 'other' ? noteTrimmed : null,
      actorUid: authUser.uid,
      actorName: userDoc.displayName,
    };
    let timer: number | null = null;
    const timeoutPromise = new Promise<{ ok: false; error: { code: string; message: string } }>((resolve) => {
      timer = window.setTimeout(() => resolve({ ok: false, error: { code: 'timeout', message: 'Save timed out.' } }), SAVE_TIMEOUT_MS);
    });
    const r = await Promise.race([createMovementAndAdjustItem(params), timeoutPromise]);
    if (timer !== null) window.clearTimeout(timer);
    setSubmitting(false); setConfirmOpen(false);
    if (!r.ok) {
      setSubmitError(mapErrorCode(r.error.code, r.error.message));
      if (r.error.code === 'meters-mismatch') reloadItem();
      return;
    }
    // Apply the boundary's authoritative newMeters in-place — no refetch on
    // the success path. reloadItem() would briefly set item to undefined and
    // unmount the snackbar + Undo affordance during a slow round-trip
    // (lead Codex P2). The transaction is atomic; the SDK's local cache is
    // already updated, so the in-memory shape matches the server post-commit.
    setItem((cur) => cur ? { ...cur, remainingMeters: r.data.newMeters, lastMovementId: r.data.movementId } : cur);
    setLastMovement({ movementId: r.data.movementId, oldMeters: params.expectedOldMeters, newMeters: r.data.newMeters });
    setSnack(`Saved: ${formatMeters(params.expectedOldMeters)} → ${formatMeters(r.data.newMeters)}`);
    setMetersInput(''); setReason(null); setNote('');
  }, [item, authUser, userDoc, targetNewMeters, reason, noteTrimmed, reloadItem]);

  const onUndo = useCallback(async () => {
    if (!lastMovement || !authUser || !userDoc || !item) return;
    // Boundary's optimistic concurrency guard rejects with `meters-mismatch`
    // if another adjustment ran in the gap. Undo issues a NEW reverse
    // transaction with reason `correction` — audit trail is preserved.
    setSubmitting(true);
    const r = await createMovementAndAdjustItem({
      itemId: item.itemId,
      expectedOldMeters: item.remainingMeters,
      newMeters: lastMovement.oldMeters,
      reason: 'correction',
      note: `Undo of ${lastMovement.movementId}`,
      actorUid: authUser.uid,
      actorName: userDoc.displayName,
    });
    setSubmitting(false); setLastMovement(null);
    if (!r.ok) {
      setSnack(null);
      setSubmitError(`Could not undo: ${mapErrorCode(r.error.code, r.error.message)}`);
      return;
    }
    // Same in-place update pattern as onConfirm — avoid the unmount race.
    setItem((cur) => cur ? { ...cur, remainingMeters: r.data.newMeters, lastMovementId: r.data.movementId } : cur);
    setSnack('Undone.');
  }, [lastMovement, authUser, userDoc, item, reloadItem]);

  if (authUser === undefined || item === undefined || userDoc === undefined) {
    return <section className="mx-auto max-w-2xl px-4 py-8"><p className="text-sm text-gray-600">Loading…</p></section>;
  }
  if (authUser === null) {
    return <section className="mx-auto max-w-2xl px-4 py-8"><p className="text-sm text-red-700">You must be signed in.</p></section>;
  }
  if (loadError || !item) {
    return (
      <section className="mx-auto max-w-2xl px-4 py-8">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">{loadError ?? 'Item not available.'}</p>
          <Link to="/" className={`${BTN_SECONDARY} mt-3`}>Back</Link>
        </div>
      </section>
    );
  }
  if (userError || !userDoc) {
    return (
      <section className="mx-auto max-w-2xl px-4 py-8">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">{userError ?? 'Profile not available.'}</p>
        </div>
      </section>
    );
  }

  const onHand = item.remainingMeters;
  const previewLabel = targetNewMeters === null ? formatMeters(onHand) : `${formatMeters(onHand)} → ${formatMeters(targetNewMeters)}`;
  const deltaLabel = delta === null ? '' : `${delta > 0 ? '+' : ''}${formatMeters(delta).replace(/^-/, '−')}`;
  const deltaClass = delta === null || delta === 0 ? 'bg-gray-100 text-gray-600'
    : delta > 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';
  const saveLabel = targetNewMeters === null ? 'Save' : `Save ${formatMeters(onHand)} → ${formatMeters(targetNewMeters)}`;

  return (
    <section className="mx-auto max-w-2xl px-4 py-6">
      {!online ? (
        <div className="sticky top-0 z-10 -mx-4 mb-3 bg-amber-100 px-4 py-2 text-sm text-amber-900">
          You are offline. Save is disabled until you reconnect.
        </div>
      ) : null}

      <header className="mb-4">
        <h1 className="text-xl font-semibold text-gray-900">Adjust {item.sku}</h1>
        <p className="mt-1 text-sm text-gray-600">{item.description || 'No description.'}</p>
      </header>

      <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4">
        <p className="text-xs uppercase tracking-wide text-gray-500">On hand</p>
        <p className="mt-1 text-3xl font-semibold text-gray-900">{formatMeters(onHand)}</p>
      </div>

      <div className="mb-4 inline-flex rounded-md border border-gray-300 bg-white" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'sold'} onClick={() => onTab('sold')}
          className={`${BTN_BASE} ${tab === 'sold' ? 'bg-gray-900 text-white' : 'text-gray-800'}`}>Sold / used</button>
        <button type="button" role="tab" aria-selected={tab === 'exact'} onClick={() => onTab('exact')}
          className={`${BTN_BASE} ${tab === 'exact' ? 'bg-gray-900 text-white' : 'text-gray-800'}`}>Set to exact</button>
      </div>

      <div className="mb-4">
        <label className="block">
          <span className="text-sm font-medium text-gray-800">
            {tab === 'sold' ? 'Meters sold or used' : 'New on-hand (meters)'}
          </span>
          <div className="mt-1 flex items-stretch gap-2">
            <button type="button" aria-label="Decrease"
              onPointerDown={() => startStep(-STEP_NUDGE)}
              onPointerUp={stopRepeat} onPointerCancel={stopRepeat} onPointerLeave={stopRepeat}
              className={`${BTN_SECONDARY} px-4`}>−</button>
            <input type="text" inputMode="decimal" autoComplete="off"
              value={metersInput} onChange={(e) => setMetersInput(e.target.value)}
              placeholder="0" className={`${INPUT} flex-1 text-center text-lg`} />
            <button type="button" aria-label="Increase"
              onPointerDown={() => startStep(STEP_NUDGE)}
              onPointerUp={stopRepeat} onPointerCancel={stopRepeat} onPointerLeave={stopRepeat}
              className={`${BTN_SECONDARY} px-4`}>+</button>
          </div>
        </label>
      </div>

      <div className="mb-4 flex items-center gap-3 rounded-md border border-gray-200 bg-gray-50 px-4 py-3">
        <span className="text-base text-gray-800">{previewLabel}</span>
        {deltaLabel ? <span className={`rounded px-2 py-0.5 text-xs font-medium ${deltaClass}`}>{deltaLabel}</span> : null}
        {targetNewMeters !== null && targetNewMeters < 0 ? <span className="text-xs text-red-700">Cannot go below zero.</span> : null}
        {parsed !== null && delta === 0 ? <span className="text-xs text-gray-600">No change to save.</span> : null}
      </div>

      <fieldset className="mb-4">
        <legend className="text-sm font-medium text-gray-800">Reason</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {REASONS.map((r) => {
            const selected = reason === r.value;
            return (
              <button key={r.value} type="button" onClick={() => setReason(r.value)} aria-pressed={selected}
                className={`${BTN_BASE} ${selected ? 'bg-gray-900 text-white' : 'border border-gray-300 text-gray-800'} px-4 py-2`}>
                {r.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      {reason === 'other' ? (
        <label className="mb-4 block">
          <span className="text-sm font-medium text-gray-800">Note (required)</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))}
            rows={2} maxLength={NOTE_MAX} placeholder="What happened?" className={INPUT} />
          <span className="mt-1 block text-xs text-gray-600">
            {noteTrimmed.length}/{NOTE_MAX} — at least {NOTE_MIN_OTHER} characters.
          </span>
        </label>
      ) : null}

      {submitError ? <p className="mb-3 text-sm text-red-700" role="alert">{submitError}</p> : null}

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onSavePressed} disabled={!saveEnabled} className={BTN_PRIMARY}>{saveLabel}</button>
        <button type="button" onClick={() => navigate(-1)} className={BTN_SECONDARY}>Cancel</button>
      </div>

      {confirmOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
            <h2 className="text-base font-semibold text-gray-900">Confirm adjustment</h2>
            <p className="mt-1 text-sm text-gray-700">
              {item.sku}: {formatMeters(onHand)} → {targetNewMeters === null ? '–' : formatMeters(targetNewMeters)}
            </p>
            {reason ? (
              <p className="mt-1 text-xs text-gray-600">
                Reason: {REASONS.find((r) => r.value === reason)?.label}
                {reason === 'other' && noteTrimmed ? ` — ${noteTrimmed}` : ''}
              </p>
            ) : null}
            <div className="mt-4">
              <HoldToConfirm label={submitting ? 'Saving…' : 'Hold to save'}
                disabled={submitting} onConfirm={() => { void onConfirm(); }} />
            </div>
            <div className="mt-3 flex justify-end">
              <button type="button" onClick={() => setConfirmOpen(false)}
                disabled={submitting} className={BTN_SECONDARY}>Cancel</button>
            </div>
          </div>
        </div>
      ) : null}

      {snack ? (
        <div className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 transform" role="status">
          <div className="flex items-center gap-3 rounded-md bg-gray-900 px-4 py-2 text-sm text-white shadow-lg">
            <span>{snack}</span>
            {lastMovement ? (
              <button type="button" onClick={() => { void onUndo(); }} disabled={submitting}
                className="rounded border border-white/30 px-2 py-0.5 text-xs">Undo</button>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default function RollsAdjustRoute() {
  const id = useParams<{ id: string }>().id ?? '';
  if (!id) {
    return <section className="mx-auto max-w-2xl px-4 py-8"><p className="text-sm text-red-700">Missing item id in URL.</p></section>;
  }
  // `key` re-mounts on URL change so internal effects + form reset cleanly.
  return <AdjustPage key={id} itemId={id} />;
}
