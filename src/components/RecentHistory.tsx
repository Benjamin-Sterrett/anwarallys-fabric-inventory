// RecentHistory (PRJ-2251) — compact movement-history preview for the
// QR-scan landing page (`/i/:itemId`). Floor staff reach items by scanning
// and land on the lighter `item.tsx` view, which previously showed no
// history at all — only a "View history" button. This surfaces the last few
// movements inline so a scan answers "what happened to this roll?" without an
// extra tap. Read-only; reuses `listMovementsForItem`. Loads independently of
// the host page (own state) so a slow/failed history read never blocks the
// item render. Relative time is computed once at load (no 1Hz tick needed for
// a short preview — the full list on `/items/:id` keeps the live ticker).

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Timestamp } from 'firebase/firestore';
import { listMovementsForItem } from '@/lib/queries';
import type { Movement } from '@/lib/models';
import { reasonLabel } from '@/components/ReasonChips';

const DEFAULT_LIMIT = 3;

// Small display formatters. This codebase's convention is to duplicate these
// per-file (formatMeters also lives in item.tsx, item-detail.tsx,
// item-adjust.tsx, lowstock.tsx); matching that convention rather than
// diverging with a single-consumer shared util.
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
function timestampMillis(at: unknown): number | null {
  if (at instanceof Timestamp) return at.toMillis();
  return null;
}
function formatRelative(at: unknown, now: number): string {
  const ms = timestampMillis(at);
  if (ms === null) return '';
  const delta = Math.max(0, now - ms);
  const sec = Math.round(delta / 1000);
  if (sec < 60) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const day = Math.floor(hr / 24);
  if (day === 1) return 'yesterday';
  return `${day} days ago`;
}

export default function RecentHistory({
  itemId,
  limit = DEFAULT_LIMIT,
}: {
  itemId: string;
  limit?: number;
}) {
  const [movements, setMovements] = useState<Movement[] | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setMovements(undefined);
    setError(null);
    void listMovementsForItem(itemId, limit).then((r) => {
      if (cancelled) return;
      if (!r.ok) {
        setMovements([]);
        setError(`Could not load history: ${r.error.message} (${r.error.code})`);
        return;
      }
      setMovements(r.data.items);
    });
    return () => {
      cancelled = true;
    };
  }, [itemId, limit, retryToken]);

  const now = Date.now();

  return (
    <section aria-labelledby="recent-history-heading" className="mb-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 id="recent-history-heading" className="text-sm font-medium text-gray-700">
          Recent history
        </h2>
        <Link to={`/items/${itemId}`} className="text-sm font-medium text-gray-700 underline">
          View full history
        </Link>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700" role="alert">{error}</p>
          <button
            type="button"
            onClick={() => setRetryToken((n) => n + 1)}
            className="mt-3 inline-flex min-h-12 items-center justify-center rounded-md border border-gray-300 px-5 py-3 text-sm font-medium text-gray-800"
          >
            Retry
          </button>
        </div>
      ) : movements === undefined ? (
        <ul className="space-y-2">
          {[0, 1, 2].map((i) => (
            <li key={i} className="h-14 animate-pulse rounded-lg border border-gray-100 bg-gray-50" />
          ))}
        </ul>
      ) : movements.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-4 text-center">
          <p className="text-sm text-gray-700">No movements yet.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {movements.map((m) => {
            const isReversal = m.reversesMovementId !== null;
            return (
              <li key={m.movementId} className="rounded-lg border border-gray-200 bg-white p-3">
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
                  >
                    {formatDelta(m.deltaMeters)}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-700">
                  <span>{reasonLabel(m.reason)}</span>
                  <span aria-hidden className="text-gray-400">·</span>
                  <span>{m.actorName}</span>
                  <span aria-hidden className="text-gray-400">·</span>
                  <span>{formatRelative(m.at, now)}</span>
                  {isReversal ? (
                    <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                      Reversal
                    </span>
                  ) : null}
                </div>
                {m.note ? <p className="mt-1 text-xs text-gray-600">{m.note}</p> : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
