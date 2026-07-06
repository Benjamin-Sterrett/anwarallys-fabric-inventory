// Find item by code (PRJ-2252) — the torn-QR backup. Each item's permanent
// QR encodes its Firestore id, but the printed label also shows the
// human-readable `sku` ("item code"). When a label is torn or won't scan,
// staff type the code here to reach the item.
//
// Read-only. Reuses `listAllActiveItems` and filters by `sku` client-side
// (case-insensitive substring) — no new Firestore query or index, which suits
// a small single-room pilot inventory. If the store ever outgrows a
// client-side scan, swap in a `where('sku', ...)` server query behind the same
// UI. Matches tap through to the item's detail page.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { listAllActiveItems } from '@/lib/queries';
import type { RollItem } from '@/lib/models';
import { Breadcrumbs } from '@/components/Breadcrumbs';

const BTN_BASE = 'inline-flex min-h-12 min-w-12 items-center justify-center rounded-md px-5 py-3 text-sm font-medium disabled:opacity-50';
const BTN_SECONDARY = `${BTN_BASE} border border-gray-300 text-gray-800`;

const round2dp = (n: number): number => Math.round(n * 100) / 100;
function formatMeters(n: number): string {
  if (!Number.isFinite(n)) return '–';
  return `${round2dp(n)} m`;
}

const MAX_RESULTS = 25;

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; items: RollItem[] };

export default function FindRoute() {
  const [loadState, setLoadState] = useState<LoadState>({ kind: 'loading' });
  const [queryText, setQueryText] = useState('');
  const [retryToken, setRetryToken] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadState({ kind: 'loading' });
    void listAllActiveItems().then((r) => {
      if (cancelled) return;
      if (!r.ok) {
        // Generic, user-friendly message — don't surface internal Firestore
        // error codes/messages to non-technical shop staff (DeepSeek review).
        setLoadState({ kind: 'error', message: 'Could not load items. Check your connection and try again.' });
        return;
      }
      setLoadState({ kind: 'ready', items: r.data });
    });
    return () => {
      cancelled = true;
    };
  }, [retryToken]);

  // Autofocus the code input so staff can start typing immediately.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const trimmed = queryText.trim().toLowerCase();
  const matches = useMemo(() => {
    if (loadState.kind !== 'ready' || trimmed === '') return [];
    return loadState.items
      .filter((it) => it.sku.toLowerCase().includes(trimmed))
      .slice(0, MAX_RESULTS);
  }, [loadState, trimmed]);

  const totalMatches = useMemo(() => {
    if (loadState.kind !== 'ready' || trimmed === '') return 0;
    return loadState.items.filter((it) => it.sku.toLowerCase().includes(trimmed)).length;
  }, [loadState, trimmed]);

  return (
    <section className="mx-auto max-w-2xl px-4 py-6">
      <Breadcrumbs items={[{ label: 'Home', to: '/' }]} />

      <header className="mt-3 mb-4">
        <h1 className="text-2xl font-semibold text-gray-900">Find item by code</h1>
        <p className="mt-1 text-sm text-gray-700">
          Type the item code printed on the label. Use this when a QR sticker is torn or won&rsquo;t scan.
        </p>
      </header>

      <label htmlFor="find-code" className="sr-only">Item code</label>
      <input
        id="find-code"
        ref={inputRef}
        type="text"
        inputMode="text"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        value={queryText}
        onChange={(e) => setQueryText(e.target.value)}
        placeholder="e.g. FAB-001"
        className="min-h-12 w-full rounded-md border border-gray-300 px-4 py-3 text-base"
      />

      <div className="mt-4">
        {loadState.kind === 'loading' ? (
          <ul className="space-y-2">
            {[0, 1, 2].map((i) => (
              <li key={i} className="h-16 animate-pulse rounded-lg border border-gray-100 bg-gray-50" />
            ))}
          </ul>
        ) : loadState.kind === 'error' ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-700" role="alert">{loadState.message}</p>
            <button type="button" onClick={() => setRetryToken((n) => n + 1)} className={`${BTN_SECONDARY} mt-3`}>
              Retry
            </button>
          </div>
        ) : trimmed === '' ? (
          <p className="text-sm text-gray-500">Start typing a code to search.</p>
        ) : matches.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center">
            <p className="text-sm text-gray-700">No item found for &ldquo;{queryText.trim()}&rdquo;.</p>
            <p className="mt-1 text-xs text-gray-500">Check the code and try again, or browse the inventory.</p>
            <Link to="/" className={`${BTN_SECONDARY} mt-4`}>Browse inventory</Link>
          </div>
        ) : (
          <>
            <ul className="space-y-2">
              {matches.map((it) => (
                <li key={it.itemId}>
                  <Link
                    to={`/items/${it.itemId}`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-3 hover:border-gray-400"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-gray-900">{it.sku}</span>
                      {it.description ? (
                        <span className="block truncate text-xs text-gray-600">{it.description}</span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-sm text-gray-700">{formatMeters(it.remainingMeters)}</span>
                  </Link>
                </li>
              ))}
            </ul>
            {totalMatches > matches.length ? (
              <p className="mt-3 text-xs text-gray-600">
                Showing {matches.length} of {totalMatches} matches. Type more of the code to narrow it down.
              </p>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
