// Item-detail page (PRJ-789) — Wave 3. Hosts the persistent home for
// Adjust entry, Undo affordance, and movement history. Mount-time read
// uses cache-backed `getItemById` so the page works on flaky storeroom
// Wi-Fi (pilot reality). This is a browse/info surface — the
// stock-write safety nets do NOT depend on this mount being fresh:
//   • PRJ-890 server rules reject stale Undo
//     (reversesMovementId === server `lastMovementId`); a stale-cache
//     mount can't trick the server into double-applying.
//   • The 15-sec Undo window is anchored on server-stamped
//     `Movement.at.toMillis()` (PRJ-883 R3), not on mount time, so a
//     stale-cache rehydration cannot extend it.
//   • The safety-critical mount lives in `/rolls/{id}/adjust`
//     (`rolls-adjust.tsx`), which keeps `getItemByIdFromServer` per
//     PRJ-883 R7. That route is the authoritative surface for stock
//     writes; this one is read-mostly + Undo entry.
// Reverting the mount-time read here was lead Codex round 1 P1 on
// PR #24: routing item-row taps to `/items/{id}` instead of `/edit`
// regressed offline browse if this mount required the network.
//
// `listMovementsForItem` is also cache-friendly for the history list.
// A 1Hz `now` tick re-evaluates the Undo window without re-fetching.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { User as FirebaseUser } from 'firebase/auth';
import { Timestamp } from 'firebase/firestore';
import { subscribeToAuthState } from '@/lib/firebase/auth';
import {
  createMovementAndAdjustItem,
  getFolderById,
  getItemById,
  getUserByUid,
  listMovementsForItem,
} from '@/lib/queries';
import type { Movement, RollItem } from '@/lib/models';
import RollLabel from '@/components/RollLabel';

const UNDO_WINDOW_MS = 15_000;
const HISTORY_PAGE_SIZE = 50;

const BTN_BASE = 'inline-flex min-h-12 min-w-12 items-center justify-center rounded-md px-5 py-3 text-sm font-medium disabled:opacity-50';
const BTN_PRIMARY = `${BTN_BASE} bg-gray-900 text-white`;
const BTN_SECONDARY = `${BTN_BASE} border border-gray-300 text-gray-800`;

import { reasonLabel } from '@/components/ReasonChips';

const round2dp = (n: number): number => Math.round(n * 100) / 100;
function formatMeters(n: number): string {
  if (!Number.isFinite(n)) return '–';
  return `${round2dp(n)} m`;
}
function formatDelta(n: number): string {
  if (!Number.isFinite(n) || n === 0) return formatMeters(n);
  const sign = n > 0 ? '+' : '−';
  return `${sign}${formatMeters(Math.abs(n))}`;
}

// `Movement.at` is `Timestamp` on read; reduces to ms-since-epoch via
// `.toMillis()`. Movements written THIS commit but read back via
// `getDocs` (cache-backed) might briefly carry an estimated server time;
// that's fine for display — the Undo window check is a sanity gate, not
// a correctness gate (boundary still authoritatively rejects stale Undo
// via `stale-reversal`).
function timestampMillis(at: unknown): number | null {
  if (at instanceof Timestamp) return at.toMillis();
  return null;
}

function formatAbsolute(at: unknown): string {
  const ms = timestampMillis(at);
  if (ms === null) return '—';
  return new Date(ms).toLocaleString();
}

function formatRelative(at: unknown, now: number): string {
  const ms = timestampMillis(at);
  if (ms === null) return '';
  const delta = Math.max(0, now - ms);
  const sec = Math.round(delta / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}

// Inline subset of rolls-adjust.tsx mapErrorCode — only the codes the
// Undo path can surface. Extraction to a shared util is its own ticket.
function mapErrorCode(code: string, fallback: string): string {
  switch (code) {
    case 'item-missing': return 'This item is missing or has been deleted. Refresh and try again.';
    case 'meters-mismatch': return 'Stock changed in another session. Refresh and retry.';
    case 'stale-reversal': return 'Another adjustment ran after this one. Refresh and retry.';
    case 'invalid-reversal': return 'Could not record this undo. Refresh and try again.';
    case 'invalid-actor': return 'You are not signed in. Sign in and try again.';
    case 'firestore/permission-denied': return 'You do not have permission to save this change.';
    case 'firestore/unavailable': return 'You appear to be offline. Reconnect and try again.';
    case 'firestore/aborted': return 'Another save happened first. Refresh and retry.';
    default: return `${fallback} (${code})`;
  }
}

interface BreadcrumbEntry { folderId: string; name: string | null; }

function Breadcrumb({ entries }: { entries: BreadcrumbEntry[] }) {
  return (
    <nav aria-label="Folder path" className="text-sm text-gray-700">
      {entries.map((entry, index) => {
        const isLast = index === entries.length - 1;
        const label = entry.name ?? 'Home';
        const to = entry.folderId === '' ? '/' : `/folders/${entry.folderId}`;
        return (
          <span key={`${entry.folderId}-${index}`}>
            {isLast
              ? <span className="font-medium text-gray-900">{label}</span>
              : <Link to={to} className="text-gray-700 underline-offset-2 hover:underline">{label}</Link>}
            {isLast ? null : <span className="mx-2 text-gray-400">/</span>}
          </span>
        );
      })}
    </nav>
  );
}

function ItemDetailPage({ itemId }: { itemId: string }) {
  const [authUser, setAuthUser] = useState<FirebaseUser | null | undefined>(undefined);
  useEffect(() => subscribeToAuthState((u) => setAuthUser(u)), []);

  const [item, setItem] = useState<RollItem | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  useEffect(() => {
    if (authUser === undefined) return;
    let cancelled = false;
    setItem(undefined); setLoadError(null);
    void getItemById(itemId).then((r) => {
      if (cancelled) return;
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
    return () => { cancelled = true; };
  }, [authUser, itemId]);

  // Folder breadcrumb. folderAncestors is rooted-to-leaf-inclusive
  // (`parent.ancestors ++ [folderId]`), so the last entry is the item's
  // own folder. Per-doc failure → fall back to short ID prefix (mirror
  // folder.tsx ancestor-chip pattern).
  const [breadcrumbEntries, setBreadcrumbEntries] = useState<BreadcrumbEntry[]>([]);
  useEffect(() => {
    if (!item) { setBreadcrumbEntries([]); return; }
    let cancelled = false;
    const ids = item.folderAncestors;
    if (ids.length === 0) { setBreadcrumbEntries([{ folderId: '', name: null }]); return; }
    void Promise.all(ids.map((id) => getFolderById(id))).then((results) => {
      if (cancelled) return;
      const home: BreadcrumbEntry = { folderId: '', name: null };
      const chips = results.map<BreadcrumbEntry>((r, i) => {
        const id = ids[i] ?? '';
        return r.ok && r.data
          ? { folderId: id, name: r.data.name }
          : { folderId: id, name: `…${id.slice(-4)}` };
      });
      setBreadcrumbEntries([home, ...chips]);
    });
    return () => { cancelled = true; };
  }, [item]);

  // History list. One-shot read on mount + after each successful Undo.
  // Cache-backed (browse, not safety-critical writes).
  const [movements, setMovements] = useState<Movement[] | undefined>(undefined);
  const [movementsError, setMovementsError] = useState<string | null>(null);
  const [hasMoreMovements, setHasMoreMovements] = useState(false);
  const [historyToken, setHistoryToken] = useState(0);
  useEffect(() => {
    if (authUser === undefined || !item) return;
    let cancelled = false;
    setMovements(undefined); setMovementsError(null); setHasMoreMovements(false);
    void listMovementsForItem(itemId, HISTORY_PAGE_SIZE).then((r) => {
      if (cancelled) return;
      if (!r.ok) {
        setMovements([]);
        setMovementsError(`Could not load history: ${r.error.message} (${r.error.code})`);
        return;
      }
      setMovements(r.data.items);
      setHasMoreMovements(r.data.hasMore);
    });
    return () => { cancelled = true; };
  }, [authUser, item, itemId, historyToken]);

  // 1Hz tick for the Undo window. Cheap; only re-renders this component.
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const lastMovement = movements && movements.length > 0 ? movements[0] : null;
  const undoEligible = useMemo<boolean>(() => {
    if (!lastMovement) return false;
    if (lastMovement.reversesMovementId !== null) return false; // suppress undo-of-undo
    // Snapshot consistency: item and movements come from separate cache reads,
    // so movements[0] can be newer than item.lastMovementId/remainingMeters
    // (cross-device adjust, flaky Wi-Fi). Server rules (PRJ-890) would reject
    // such an Undo with stale-reversal/meters-mismatch — gate the button here
    // so we don't offer an action that can't succeed.
    if (item === null || item === undefined) return false;
    if (item.lastMovementId !== lastMovement.movementId) return false;
    if (item.remainingMeters !== lastMovement.newMeters) return false;
    const ms = timestampMillis(lastMovement.at);
    if (ms === null) return false;
    // Clamp future-stamped movements (device clock behind Firestore) to age=0.
    // Without the clamp, a negative age passes <= UNDO_WINDOW_MS and the Undo
    // button stays visible forever. Server rule check (PRJ-890) is the real
    // safety net; this is UX. Clock-ahead case (window closes early) is UX
    // inconvenience only — server rejection prevents actual harm.
    const ageMs = Math.max(0, now - ms);
    return ageMs <= UNDO_WINDOW_MS;
  }, [lastMovement, item, now]);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const onUndo = useCallback(async () => {
    if (!lastMovement || !item || !authUser) return;
    setSubmitting(true); setSubmitError(null);
    // Re-fetch userDoc fresh per write — admin may have renamed this
    // staff via /staff while this tab stayed open. Security Rules
    // require actorName === /users/{uid}.displayName; cached value
    // would silently fail with permission-denied. Mirror PRJ-787 R6.
    const fresh = await getUserByUid(authUser.uid);
    if (!fresh.ok || !fresh.data) {
      setSubmitting(false);
      setSubmitError('Could not verify your staff profile. Sign out and back in, then try again.');
      return;
    }
    const r = await createMovementAndAdjustItem({
      itemId: item.itemId,
      expectedOldMeters: item.remainingMeters,
      newMeters: lastMovement.oldMeters,
      reason: 'correction',
      note: null,
      actorUid: authUser.uid,
      actorName: fresh.data.displayName,
      reversesMovementId: lastMovement.movementId,
    });
    setSubmitting(false);
    if (!r.ok) {
      setSubmitError(`Could not undo: ${mapErrorCode(r.error.code, r.error.message)}`);
      return;
    }
    // In-place setItem from authoritative boundary return — same pattern
    // as rolls-adjust.tsx onConfirm/onUndo (lead Codex P2: refetching
    // here would unmount the freshly-rendered Undo affordance).
    setItem((cur) => cur ? { ...cur, remainingMeters: r.data.newMeters, lastMovementId: r.data.movementId } : cur);
    // Refresh history so the new reversal row + suppressed Undo render.
    setHistoryToken((n) => n + 1);
  }, [lastMovement, item, authUser]);

  if (authUser === undefined || item === undefined) {
    return (
      <section className="mx-auto max-w-2xl px-4 py-8">
        <p className="text-sm text-gray-600">Loading…</p>
      </section>
    );
  }
  if (authUser === null) {
    return (
      <section className="mx-auto max-w-2xl px-4 py-8">
        <p className="text-sm text-red-700">You must be signed in.</p>
      </section>
    );
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

  return (
    <section className="mx-auto max-w-2xl px-4 py-6">
      <Breadcrumb entries={breadcrumbEntries} />

      <header className="mt-3 mb-4">
        <h1 className="text-2xl font-semibold text-gray-900">{item.sku}</h1>
        {item.description ? (
          <p className="mt-1 whitespace-pre-line text-sm text-gray-700">{item.description}</p>
        ) : null}
      </header>

      <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4">
        <p className="text-xs uppercase tracking-wide text-gray-500">On hand</p>
        <p className="mt-1 text-3xl font-semibold text-gray-900">{formatMeters(item.remainingMeters)}</p>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-gray-700">
          <dt className="text-gray-500">Original</dt>
          <dd>{formatMeters(item.initialMeters)}</dd>
          {item.supplier ? (<>
            <dt className="text-gray-500">Supplier</dt>
            <dd>{item.supplier}</dd>
          </>) : null}
          {item.price !== null ? (<>
            <dt className="text-gray-500">Price / m</dt>
            <dd>{item.price}</dd>
          </>) : null}
        </dl>
        {item.photoUrl ? (
          <img
            src={item.photoUrl}
            alt={`Photo of ${item.sku}`}
            className="mt-3 max-h-48 w-full rounded-md border border-gray-200 object-contain"
            loading="lazy"
          />
        ) : null}
        <div className="mt-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">QR label</p>
          <div className="mt-2">
            <RollLabel itemId={item.itemId} />
          </div>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <Link to={`/rolls/${item.itemId}/adjust`} className={BTN_PRIMARY}>Adjust stock</Link>
        <Link to={`/items/${item.itemId}/edit`} className={BTN_SECONDARY}>Edit metadata</Link>
      </div>

      {undoEligible && lastMovement ? (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs uppercase tracking-wide text-amber-800">Last change — Undo available</p>
          <p className="mt-1 text-sm text-gray-900">
            {formatMeters(lastMovement.oldMeters)} → {formatMeters(lastMovement.newMeters)}
            {' '}<span className="text-gray-600">({formatDelta(lastMovement.deltaMeters)})</span>
          </p>
          <p className="mt-1 text-xs text-gray-700">
            {reasonLabel(lastMovement.reason)} · {lastMovement.actorName} · {formatRelative(lastMovement.at, now)}
          </p>
          {submitError ? <p className="mt-2 text-sm text-red-700" role="alert">{submitError}</p> : null}
          <div className="mt-3">
            <button
              type="button"
              onClick={() => { void onUndo(); }}
              disabled={submitting}
              className={BTN_PRIMARY}
            >
              {submitting ? 'Undoing…' : 'Undo this change'}
            </button>
          </div>
        </div>
      ) : submitError ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700" role="alert">{submitError}</p>
        </div>
      ) : null}

      <section aria-labelledby="history-heading" className="mt-2">
        <h2 id="history-heading" className="mb-2 text-sm font-medium text-gray-700">Movement history</h2>
        {movementsError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-700">{movementsError}</p>
            <button
              type="button"
              onClick={() => setHistoryToken((n) => n + 1)}
              className={`${BTN_SECONDARY} mt-3`}
            >Retry</button>
          </div>
        ) : movements === undefined ? (
          <ul className="space-y-2">
            {[0, 1, 2].map((i) => (
              <li key={i} className="h-16 animate-pulse rounded-lg border border-gray-100 bg-gray-50" />
            ))}
          </ul>
        ) : movements.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center">
            <p className="text-sm text-gray-700">No movements yet.</p>
          </div>
        ) : (
          <>
          <ul className="space-y-2">
            {movements.map((m) => {
              const isReversal = m.reversesMovementId !== null;
              return (
                <li
                  key={m.movementId}
                  className="rounded-lg border border-gray-200 bg-white p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-gray-900">
                      {formatMeters(m.oldMeters)} → {formatMeters(m.newMeters)}
                    </span>
                    <span
                      className={
                        m.deltaMeters > 0
                          ? 'rounded px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800'
                          : m.deltaMeters < 0
                            ? 'rounded px-2 py-0.5 text-xs font-medium bg-red-100 text-red-800'
                            : 'rounded px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600'
                      }
                    >{formatDelta(m.deltaMeters)}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-700">
                    <span>{reasonLabel(m.reason)}</span>
                    <span aria-hidden className="text-gray-400">·</span>
                    <span>{m.actorName}</span>
                    <span aria-hidden className="text-gray-400">·</span>
                    <span title={formatAbsolute(m.at)}>{formatRelative(m.at, now)}</span>
                    {isReversal ? (
                      <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                        Reversal
                      </span>
                    ) : null}
                  </div>
                  {m.note ? (
                    <p className="mt-1 text-xs text-gray-600">{m.note}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {hasMoreMovements ? (
            <p className="mt-3 text-xs text-gray-600">
              Showing the {HISTORY_PAGE_SIZE} most recent adjustments. Older entries are not shown.
            </p>
          ) : null}
          </>
        )}
      </section>
    </section>
  );
}

export default function ItemDetailRoute() {
  const itemId = useParams<{ itemId: string }>().itemId ?? '';
  if (!itemId) {
    return (
      <section className="mx-auto max-w-2xl px-4 py-8">
        <p className="text-sm text-red-700">Missing item id in URL.</p>
      </section>
    );
  }
  // `key` re-mounts on URL change so internal effects re-run cleanly.
  return <ItemDetailPage key={itemId} itemId={itemId} />;
}
