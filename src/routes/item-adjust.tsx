// Stock adjustment route (PRJ-787) — only consumer of
// `createMovementAndAdjustItem`. Boundary owns invariants; UI translates
// intent → params and Result → UI states. Modal/snackbar/chips inlined
// (PRJ-791 extracts modal, PRJ-788 polishes chips). `actorName` MUST come
// from /users/{uid}.displayName — Auth profile is stale (PRJ-876).

import {
  useCallback, useEffect, useMemo, useRef, useState,
  type CSSProperties, type PointerEvent as ReactPointerEvent,
} from 'react';
import { Link, useParams } from 'react-router-dom';
import type { User as FirebaseUser } from 'firebase/auth';
import { Timestamp } from 'firebase/firestore';
import { subscribeToAuthState } from '@/lib/firebase/auth';
import { createMovementAndAdjustItem, findMovementByCorrelationId, getItemByIdFromServer, getUserByUid } from '@/lib/queries';
import type { Movement, MovementReason, RollItem, User } from '@/lib/models';
import { randomUUIDv4 } from '@/lib/util/uuid';
import ReasonChips, { reasonLabel } from '@/components/ReasonChips';
import BackButton from '@/components/BackButton';

const HOLD_MS = 800;
const STEP_DELAY_MS = 500;
const STEP_INTERVAL_MS = 100;
const STEP_NUDGE = 0.5;
const NOTE_MAX = 200;
const NOTE_MIN_OTHER = 3;
const SAVE_TIMEOUT_MS = 10_000;
const UNDO_WINDOW_MS = 15_000;
// PRJ-883: timeout reconciliation. After a `Promise.race` timeout fires,
// the underlying transaction may still be in flight server-side. Poll
// `/movements` for the correlation id; first probe is immediate, then
// one retry after a grace period for in-flight commits to land.
const RECONCILE_RETRY_DELAY_MS = 2500;
const RECONCILE_MAX_ATTEMPTS = 2;



const BTN_BASE = 'inline-flex min-h-12 min-w-12 items-center justify-center rounded-md px-5 py-3 text-sm font-medium disabled:opacity-50';
const BTN_PRIMARY = `${BTN_BASE} bg-gray-900 text-white`;
const BTN_SECONDARY = `${BTN_BASE} border border-gray-300 text-gray-800`;
const INPUT = 'mt-1 block w-full min-h-12 rounded-md border border-gray-300 px-3 py-2 text-base';

type Tab = 'sold' | 'exact';

// 2dp rounding — parser, sold-tab subtraction, stepper all share (R4 P2.1).
const round2dp = (n: number): number => Math.round(n * 100) / 100;

// Strict allowlist; ESL `9,5` parses, `-3` `9..5` `1.234` rejected.
// Rounded to 2dp so display === persisted (R2 P1).
function parseDecimalLocale(raw: string): number | null {
  const s = raw.trim();
  if (s === '' || !/^[0-9]+([.,][0-9]{1,2})?$/.test(s)) return null;
  const n = Number(s.replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return null;
  return round2dp(n);
}

function formatMeters(n: number): string {
  if (!Number.isFinite(n)) return '–';
  return `${round2dp(n)} m`;
}

function mapErrorCode(code: string, fallback: string): string {
  switch (code) {
    case 'item-missing': return 'This roll is missing or has been deleted. Refresh and try again.';
    case 'meters-mismatch': return 'Stock changed in another session. Refresh and retry.';
    case 'stale-reversal': return 'Another adjustment ran after this one. Refresh and retry.';
    case 'invalid-reversal': return 'Could not record this undo. Refresh and try again.';
    case 'invalid-correlation-id': return 'Could not record this save. Refresh and try again.';
    case 'invalid-meters': return 'The meters value is not valid. Check the number and try again.';
    case 'zero-delta': return 'No change to save.';
    case 'invalid-actor': return 'You are not signed in. Sign in and try again.';
    case 'firestore/permission-denied': return 'You do not have permission to save this change.';
    case 'firestore/unavailable': return 'You appear to be offline. Reconnect and try again.';
    case 'firestore/aborted': return 'Another save happened first. Refresh and retry.';
    case 'timeout': return 'Save took too long. Check your internet and retry.';
    case 'already-applied': return 'This adjustment was already saved earlier.';
    default: return `${fallback} (${code})`;
  }
}

// PRJ-883: Reconcile a timed-out save against the authoritative server
// state. Polls `findMovementByCorrelationId` up to `RECONCILE_MAX_ATTEMPTS`
// times, with `RECONCILE_RETRY_DELAY_MS` between probes, to absorb the
// window where a transaction commit lands AFTER the client-side timeout
// fires.
//
// Two-outcome reconcile (R1 P1.b / lead Codex round 1):
//   - 'found'         → server returned the movement; positive proof of
//                       commit. UI can safely show "Saved" + Undo using
//                       the SERVER-AUTHORITATIVE values.
//   - 'inconclusive'  → no commit observed yet (every probe returned
//                       null cleanly) OR a probe errored. We do NOT
//                       collapse all-null to "not-committed": absence of
//                       evidence is not evidence of absence. The
//                       original `createMovementAndAdjustItem` promise
//                       can still be in flight and commit AFTER the
//                       second null poll on a slow / retried connection.
//                       Declaring 'not-committed' from absence would
//                       create a real double-apply window — operator
//                       retries, original write lands later, item state
//                       corrupted. UI shows the conservative "may or
//                       may not have gone through — verify on-hand,
//                       then re-enter only if needed" message and
//                       withholds Undo. Confirmed-not-committed (with
//                       safe-to-retry semantics) requires write-side
//                       idempotency; deferred to a follow-up ticket.
async function reconcileTimedOutSave(
  itemId: string,
  clientCorrelationId: string,
  actorUid: string,
): Promise<{ kind: 'found'; movement: Movement } | { kind: 'inconclusive' }> {
  for (let attempt = 0; attempt < RECONCILE_MAX_ATTEMPTS; attempt += 1) {
    if (attempt > 0) {
      await new Promise<void>((resolve) => window.setTimeout(resolve, RECONCILE_RETRY_DELAY_MS));
    }
    // PRJ-892: query by correlationId + itemId + actorUid. Actor scoping
    // prevents read-side leak via correlation-id injection (Codex R2).
    const r = await findMovementByCorrelationId(itemId, clientCorrelationId, actorUid);
    if (r.ok && r.data !== null) return { kind: 'found', movement: r.data };
    // r.ok && r.data === null  → not yet observed; keep polling.
    // !r.ok                    → probe errored; keep polling.
    // Either way, fall through to the next attempt.
  }
  return { kind: 'inconclusive' };
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

// Press HOLD_MS → onConfirm. Second double-save guard (first is `submitting`).
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
    <div className="w-full">
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
      <p className="mt-2 text-center text-xs text-gray-600">
        Press and hold to confirm
      </p>
    </div>
  );
}

function AdjustPage({ itemId }: { itemId: string }) {
  const online = useOnline();

  const [authUser, setAuthUser] = useState<FirebaseUser | null | undefined>(undefined);
  useEffect(() => subscribeToAuthState((u) => setAuthUser(u)), []);

  const [item, setItem] = useState<RollItem | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  // Mount-time server-authoritative read (R7 P1, PRJ-883 / PRJ-893): the
  // "Reload page" affordance is the only recovery path after an inconclusive
  // timeout, so cache-backed mount could rehydrate pre-commit `remainingMeters`
  // and defeat the safety net. Forcing a server roundtrip guarantees the
  // operator sees state after any in-flight tx settles. Trade-off: this route
  // is no longer offline-friendly on initial mount (writes are blocked offline
  // anyway per pilot policy). Browse routes still use cache-backed reads.
  const reloadItem = useCallback(() => {
    setItem(undefined); setLoadError(null);
    void getItemByIdFromServer(itemId).then((r) => {
      if (!r.ok) {
        setItem(null);
        const offline = r.error.code === 'firestore/unavailable';
        const hint = offline ? ' You appear to be offline; reconnect and reload.' : '';
        setLoadError(`Could not load this item: ${r.error.message} (${r.error.code}).${hint}`);
        return;
      }
      if (!r.data) { setItem(null); setLoadError('That item is missing or has been deleted.'); return; }
      setItem(r.data);
    });
  }, [itemId]);
  // Server-authoritative reload (R5 P1): cache can hold pre-commit state for
  // seconds after a transaction lands. Used on timeout + meters-mismatch
  // recovery so the operator never re-applies an adjustment that already
  // succeeded. Returns true on success, false on server-read failure.
  // PRJ-885: on read failure preserve the last-known item and surface the
  // error separately so the operator can retry without losing form context.
  const reloadItemFromServer = useCallback(async (): Promise<boolean> => {
    setVerifyError(null);
    const r = await getItemByIdFromServer(itemId);
    if (!r.ok) {
      setVerifyError(`Could not verify the current on-hand from the server: ${r.error.message} (${r.error.code}). Refresh the page before retrying.`);
      return false;
    }
    if (!r.data) { setItem(null); setLoadError('That item is missing or has been deleted.'); return false; }
    setItem(r.data);
    return true;
  }, [itemId]);
  useEffect(() => { if (authUser !== undefined) reloadItem(); }, [authUser, reloadItem]);

  // /users/{uid}.displayName fetch — see file header re: PRJ-876.
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
  // PRJ-892: write-side idempotency. Stash the correlationId across retries
  // so a timed-out save can be retried with the same idempotent key.
  const [pendingCorrelationId, setPendingCorrelationId] = useState<string | null>(null);
  // R2 P1 / lead Codex round 2: when the timeout-reconcile probe is
  // inconclusive, the on-screen on-hand cannot be trusted (the original
  // transaction can still commit AFTER our last poll, so a fresh
  // server read can return PRE-commit meters). The only safe posture is
  // to disable the form and force the operator to manually reload or
  // retry with the same idempotent key — page reload guarantees a fresh
  // snapshot after the SDK has had time to settle the in-flight transaction.
  type SaveState = 'idle' | 'submitting' | 'inconclusive' | 'late-success' | 'error';
  const [saveState, setSaveState] = useState<SaveState>('idle');

  useEffect(() => {
    if (!lastMovement) return;
    const t = window.setTimeout(() => { setLastMovement(null); setSnack(null); }, UNDO_WINDOW_MS);
    return () => window.clearTimeout(t);
  }, [lastMovement]);

  // Snack-only auto-dismiss (R1 P3) — covers post-undo "Undone." banner.
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

  // Sold: round2dp guards against legacy drifted remainingMeters (R4 P2.1).
  const targetNewMeters = useMemo<number | null>(() => {
    if (parsed === null || !item) return null;
    if (tab === 'sold') {
      const next = round2dp(item.remainingMeters - parsed);
      return Number.isFinite(next) ? next : null;
    }
    return parsed;
  }, [parsed, tab, item]);

  const delta = useMemo<number | null>(
    () => targetNewMeters === null || !item ? null : targetNewMeters - item.remainingMeters,
    [targetNewMeters, item],
  );

  // Strict eq, not epsilon (R5 P2): the boundary's zero-delta gate is also
  // strict, so legacy 3dp-drift items can be normalized via Set-to-exact.
  const previewValid = targetNewMeters !== null && !!item && targetNewMeters >= 0
    && targetNewMeters !== item.remainingMeters;
  const noteTrimmed = note.trim();
  const noteValid = reason !== 'other' || (noteTrimmed.length >= NOTE_MIN_OTHER && noteTrimmed.length <= NOTE_MAX);
  const saveEnabled = online && previewValid && reason !== null && noteValid && !submitting && !!item && !!userDoc && saveState !== 'inconclusive';

  const stepBy = useCallback((amount: number) => {
    setMetersInput((cur) => {
      const n = parseDecimalLocale(cur) ?? 0;
      return String(Math.max(0, round2dp(n + amount)));
    });
  }, []);
  const startStep = useCallback((amount: number) => {
    stopRepeat();
    stepBy(amount);
    repeatRef.current.delay = window.setTimeout(() => {
      repeatRef.current.interval = window.setInterval(() => stepBy(amount), STEP_INTERVAL_MS);
    }, STEP_DELAY_MS);
  }, [stopRepeat, stepBy]);

  const onTab = useCallback((next: Tab) => {
    if (next === tab) return;
    setTab(next);
    setMetersInput('');
    setReason(null);
    setNote('');
    setSubmitError(null);
  }, [tab]);

  const onSavePressed = useCallback(() => {
    setSubmitError(null);
    if (saveEnabled) setConfirmOpen(true);
  }, [saveEnabled]);

  const onConfirm = useCallback(async () => {
    if (!item || !authUser || !userDoc || targetNewMeters === null || reason === null) return;
    setSubmitting(true); setSubmitError(null); setSaveState('submitting');
    // Re-fetch userDoc fresh (R6 P2): admin may have renamed this staff via
    // /staff while this tab stayed open. Security Rules require actorName ===
    // /users/{uid}.displayName; a stale cached value would silently fail with
    // permission-denied. Single-doc read is cheap; failed write is worse.
    const freshUser = await getUserByUid(authUser.uid);
    if (!freshUser.ok || !freshUser.data) {
      setSubmitting(false);
      setConfirmOpen(false);
      setSaveState('error');
      setSubmitError('Could not verify your staff profile. Sign out and back in, then try again.');
      return;
    }
    setUserDoc(freshUser.data);
    // PRJ-892: reuse pending correlationId for retries, else generate fresh.
    const correlationId = pendingCorrelationId ?? randomUUIDv4();
    if (!pendingCorrelationId) setPendingCorrelationId(correlationId);
    // Asymmetry intentional (R2 P1.d): expectedOldMeters raw (boundary
    // strict-equals stored value); newMeters rounded (parser rounds at parse).
    const params = {
      itemId: item.itemId,
      expectedOldMeters: item.remainingMeters,
      newMeters: targetNewMeters,
      reason,
      note: reason === 'other' ? noteTrimmed : null,
      actorUid: authUser.uid,
      actorName: freshUser.data.displayName,
      clientCorrelationId: correlationId,
    };
    let timer: number | null = null;
    const timeoutPromise = new Promise<{ ok: false; error: { code: string; message: string } }>((resolve) => {
      timer = window.setTimeout(() => resolve({ ok: false, error: { code: 'timeout', message: 'Save timed out.' } }), SAVE_TIMEOUT_MS);
    });
    const r = await Promise.race([createMovementAndAdjustItem(params), timeoutPromise]);
    if (timer !== null) window.clearTimeout(timer);
    // Lead Codex R4 P1: keep `submitting` true through reconcile. Closing the
    // confirm modal early is fine (it's just chrome); but flipping submitting
    // to false here re-enabled Save/Undo during the 0–2.5s timeout reconcile
    // poll, defeating this PR's double-apply protection. Defer to terminal
    // branches: success, non-timeout error, found, inconclusive.
    setConfirmOpen(false);
    if (!r.ok) {
      // PRJ-892: write-side idempotency handles already-applied directly.
      if (r.error.code === 'already-applied') {
        const lookup = await findMovementByCorrelationId(item.itemId, correlationId, authUser.uid);
        if (lookup.ok && lookup.data) {
          const m = lookup.data;
          setItem((cur) => cur ? { ...cur, remainingMeters: m.newMeters, lastMovementId: m.movementId } : cur);
          // Only grant Undo if the movement is still within the 15-sec window.
          const movementTime = m.at instanceof Timestamp ? m.at.toMillis() : Date.now();
          if (Date.now() - movementTime < UNDO_WINDOW_MS) {
            setLastMovement({ movementId: m.movementId, oldMeters: m.oldMeters, newMeters: m.newMeters });
          }
          setSnack(`Saved: ${formatMeters(m.oldMeters)} → ${formatMeters(m.newMeters)}`);
          setMetersInput(''); setReason(null); setNote('');
          setSubmitting(false);
          setSaveState('idle');
          setPendingCorrelationId(null);
          return;
        }
        // If lookup fails or returns null, fall through to generic error
        setSubmitError('This adjustment was already saved, but we could not retrieve the details. Reload the page to verify.');
        setSubmitting(false);
        setSaveState('error');
        return;
      }
      // PRJ-883: timeout reconciliation. The client-side `Promise.race`
      // timeout fires before the server has acknowledged commit, but the
      // transaction may still be in flight. Query `/movements` for the
      // correlation id we wrote into `params.clientCorrelationId`:
      // - found: authoritative proof of commit — restore snackbar + Undo
      //   using the server-authoritative movement values.
      // - inconclusive: NO positive proof of commit (all probes null
      //   and/or errored). Show conservative "may or may not have gone
      //   through" message and withhold Undo. We do NOT claim the write
      //   failed — the original transaction can still commit after any
      //   number of null polls, and a "safe to retry" claim would create
      //   a real double-apply window. Confirmed-not-committed semantics
      //   require write-side idempotency; tracked as a follow-up.
      if (r.error.code === 'timeout') {
        const outcome = await reconcileTimedOutSave(item.itemId, correlationId, authUser.uid);
        if (outcome.kind === 'found') {
          // Late-success path — restore the 15-sec Undo window. Use the
          // server-authoritative movement values (oldMeters/newMeters/
          // movementId), NOT the client request, so a query hit can
          // never mislead the Undo math.
          //
          // R6: no post-success `reloadItemFromServer()` here. The
          // earlier R5 refresh existed to refresh `item.updatedAt` for
          // the next save's reconcile time-bound — the time-bound itself
          // is gone (R6 design simplification), so the refresh is
          // unnecessary. It was also masking the snackbar/Undo
          // affordance during the refetch (reloadItemFromServer sets
          // item to undefined), which could swallow the 15-sec Undo
          // window on slow networks.
          const m = outcome.movement;
          setItem((cur) => cur ? { ...cur, remainingMeters: m.newMeters, lastMovementId: m.movementId } : cur);
          // Only grant Undo if the movement is still within the 15-sec window.
          const movementTime = m.at instanceof Timestamp ? m.at.toMillis() : Date.now();
          if (Date.now() - movementTime < UNDO_WINDOW_MS) {
            setLastMovement({ movementId: m.movementId, oldMeters: m.oldMeters, newMeters: m.newMeters });
          }
          setSnack(`Saved: ${formatMeters(m.oldMeters)} → ${formatMeters(m.newMeters)}`);
          setMetersInput(''); setReason(null); setNote('');
          setSubmitting(false);
          setSaveState('idle');
          setPendingCorrelationId(null);
          return;
        }
        // outcome.kind === 'inconclusive' — could still be in flight
        // server-side (R2 P1 / lead Codex round 2: the original
        // transaction can still commit AFTER our last poll, so even a
        // fresh server-read of the item could return PRE-commit meters
        // — operator would re-enter from a stale on-hand and double-
        // apply once the original lands). The only safe posture is to
        // disable the form entirely and force the operator to reload
        // the page manually or retry with the same idempotent key.
        // Page reload guarantees a fresh snapshot after the SDK has had
        // time to settle the in-flight tx. NO auto-recovery, NO Undo
        // affordance, NO "safe to retry" claim.
        setSaveState('inconclusive');
        setPendingCorrelationId(correlationId);
        setSubmitError('Save took too long. The change may or may not have gone through. You can retry with the same save ID, or reload the page to verify.');
        setSubmitting(false);
        return;
      }
      // Concurrent edit (R3 P1) — same server-read for the same reason (R5 P1).
      if (r.error.code === 'meters-mismatch') {
        setMetersInput('');
        setSubmitError('Stock changed in another session. Check the new on-hand and re-enter your adjustment.');
        void reloadItemFromServer();
        setSubmitting(false);
        setSaveState('error');
        setPendingCorrelationId(null);
        return;
      }
      setSubmitError(mapErrorCode(r.error.code, r.error.message));
      setSubmitting(false);
      setSaveState('error');
      return;
    }
    // In-place setItem from authoritative boundary return — no refetch on
    // success path (lead Codex P2: refetch unmounted Undo affordance).
    // R6: no post-success `reloadItemFromServer()`. The earlier R5 call
    // existed only to refresh `item.updatedAt` for the next save's
    // reconcile time-bound; the time-bound is gone after R6, so the
    // refresh is unnecessary — and it was hiding the snackbar/Undo
    // during refetch.
    setItem((cur) => cur ? { ...cur, remainingMeters: r.data.newMeters, lastMovementId: r.data.movementId } : cur);
    setLastMovement({ movementId: r.data.movementId, oldMeters: params.expectedOldMeters, newMeters: r.data.newMeters });
    setSnack(`Saved: ${formatMeters(params.expectedOldMeters)} → ${formatMeters(r.data.newMeters)}`);
    setMetersInput(''); setReason(null); setNote('');
    setSubmitting(false);
    setSaveState('idle');
    setPendingCorrelationId(null);
  }, [item, authUser, userDoc, targetNewMeters, reason, noteTrimmed, reloadItemFromServer, pendingCorrelationId]);

  const onUndo = useCallback(async () => {
    if (!lastMovement || !authUser || !userDoc || !item) return;
    setSubmitting(true);
    // Re-fetch userDoc fresh (R6 P2 — same reason as onConfirm).
    const freshUser = await getUserByUid(authUser.uid);
    if (!freshUser.ok || !freshUser.data) {
      setSubmitting(false);
      setSubmitError('Could not verify your staff profile. Sign out and back in, then try again.');
      return;
    }
    setUserDoc(freshUser.data);
    // Boundary's optimistic concurrency guard rejects with `meters-mismatch`
    // if another adjustment ran in the gap. Undo issues a NEW reverse
    // transaction with reason `correction` — audit trail is preserved.
    const r = await createMovementAndAdjustItem({
      itemId: item.itemId,
      expectedOldMeters: item.remainingMeters,
      newMeters: lastMovement.oldMeters,
      reason: 'correction',
      // PRJ-890: typed back-reference replaces the prior locale-fragile
      // `note: "Undo of <id>"` convention. `note` stays user-typed
      // free-form (null on undo — staff didn't type anything).
      note: null,
      actorUid: authUser.uid,
      actorName: freshUser.data.displayName,
      reversesMovementId: lastMovement.movementId,
    });
    setSubmitting(false);
    if (!r.ok) {
      setLastMovement(null);
      setSnack(null);
      setSubmitError(`Could not undo: ${mapErrorCode(r.error.code, r.error.message)}`);
      return;
    }
    // Same in-place update pattern as onConfirm — avoid the unmount race.
    // R6: no post-undo `reloadItemFromServer()` (R6 design simplification —
    // see onConfirm comments). The boundary returns server-authoritative
    // values; nothing else needs refreshing.
    setItem((cur) => cur ? { ...cur, remainingMeters: r.data.newMeters, lastMovementId: r.data.movementId } : cur);
    // State ordering fix [PRJ-907]: setSnack must come before setLastMovement(null).
    // If lastMovement becomes null first, the snack-only auto-dismiss effect sees
    // the stale "Saved: X → Y" snack and schedules a 4s clear, racing React 19
    // batching and potentially hiding the "Undone." message immediately.
    setSnack('Undone.');
    setLastMovement(null);
  }, [lastMovement, authUser, userDoc, item]);

  if (authUser === undefined || item === undefined || userDoc === undefined) {
    // submitError stays above the loading shell so meters-mismatch/timeout
    // messages survive the reload window (R4 P2.2; mirrors R1 P2 success path).
    return (
      <section className="mx-auto max-w-2xl px-4 py-8">
        {submitError ? <p className="mb-3 text-sm text-red-700" role="alert">{submitError}</p> : null}
        <p className="text-sm text-gray-600">Loading…</p>
      </section>
    );
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
  const noChange = targetNewMeters !== null && targetNewMeters === onHand;
  const deltaClass = delta === null || noChange ? 'bg-gray-100 text-gray-600'
    : delta > 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';
  const saveLabel = targetNewMeters === null ? 'Save' : `Save ${formatMeters(onHand)} → ${formatMeters(targetNewMeters)}`;

  return (
    <section className="mx-auto max-w-2xl px-4 py-6">
      <BackButton />

      {!online ? (
        <div className="sticky top-0 z-10 -mx-4 mb-3 bg-amber-100 px-4 py-2 text-sm text-amber-900">
          You are offline. Save is disabled until you reconnect.
        </div>
      ) : null}
      {verifyError ? (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">{verifyError}</p>
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
          disabled={saveState === 'inconclusive'}
          className={`${BTN_BASE} ${tab === 'sold' ? 'bg-gray-900 text-white' : 'text-gray-800'}`}>Sold / used</button>
        <button type="button" role="tab" aria-selected={tab === 'exact'} onClick={() => onTab('exact')}
          disabled={saveState === 'inconclusive'}
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
              disabled={saveState === 'inconclusive'}
              className={`${BTN_SECONDARY} px-4`}>−</button>
            <input type="text" inputMode="decimal" autoComplete="off"
              value={metersInput} onChange={(e) => setMetersInput(e.target.value)}
              disabled={saveState === 'inconclusive'}
              placeholder="0" className={`${INPUT} flex-1 text-center text-lg disabled:bg-gray-100 disabled:opacity-50`} />
            <button type="button" aria-label="Increase"
              onPointerDown={() => startStep(STEP_NUDGE)}
              onPointerUp={stopRepeat} onPointerCancel={stopRepeat} onPointerLeave={stopRepeat}
              disabled={saveState === 'inconclusive'}
              className={`${BTN_SECONDARY} px-4`}>+</button>
          </div>
        </label>
      </div>

      <div className="mb-4 flex items-center gap-3 rounded-md border border-gray-200 bg-gray-50 px-4 py-3">
        <span className="text-base text-gray-800">{previewLabel}</span>
        {deltaLabel ? <span className={`rounded px-2 py-0.5 text-xs font-medium ${deltaClass}`}>{deltaLabel}</span> : null}
        {targetNewMeters !== null && targetNewMeters < 0 ? <span className="text-xs text-red-700">Cannot go below zero.</span> : null}
        {parsed !== null && noChange ? <span className="text-xs text-gray-600">No change to save.</span> : null}
      </div>

      <ReasonChips
        value={reason}
        onChange={setReason}
        disabled={saveState === 'inconclusive'}
        note={note}
        onNoteChange={setNote}
        noteMaxLength={NOTE_MAX}
        noteMinLength={NOTE_MIN_OTHER}
      />

      {submitError ? <p className="mb-3 text-sm text-red-700" role="alert">{submitError}</p> : null}

      <div className="flex flex-wrap gap-2">
        {saveState === 'inconclusive' ? (
          <>
            <button type="button" onClick={() => { void onConfirm(); }} disabled={submitting} className={BTN_PRIMARY}>Retry save</button>
            <button type="button" onClick={() => window.location.reload()} className={BTN_SECONDARY}>Reload page</button>
          </>
        ) : (
          <button type="button" onClick={onSavePressed} disabled={!saveEnabled} className={BTN_PRIMARY}>{saveLabel}</button>
        )}
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
                Reason: {reasonLabel(reason)}
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

export default function ItemAdjustRoute() {
  const id = useParams<{ id: string }>().id ?? '';
  if (!id) {
    return <section className="mx-auto max-w-2xl px-4 py-8"><p className="text-sm text-red-700">Missing item id in URL.</p></section>;
  }
  // `key` re-mounts on URL change so internal effects + form reset cleanly.
  return <AdjustPage key={id} itemId={id} />;
}
