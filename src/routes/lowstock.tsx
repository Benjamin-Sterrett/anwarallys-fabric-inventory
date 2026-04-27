import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listAllActiveItems } from '@/lib/queries';
import type { RollItem } from '@/lib/models';

const BTN_BASE = 'inline-flex min-h-12 min-w-12 items-center justify-center rounded-md px-5 py-3 text-sm font-medium disabled:opacity-50';
const BTN_PRIMARY = `${BTN_BASE} bg-gray-900 text-white`;
const BTN_SECONDARY = `${BTN_BASE} border border-gray-300 text-gray-800`;

function formatMeters(n: number): string {
  if (!Number.isFinite(n)) return '–';
  return `${Math.round(n * 100) / 100} m`;
}

function Skeleton() {
  return (
    <section className="mx-auto max-w-5xl px-4 py-6">
      <div className="h-8 w-48 animate-pulse rounded bg-gray-200" />
      <div className="mt-4 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-lg bg-gray-100" />
        ))}
      </div>
    </section>
  );
}

export default function LowStockRoute() {
  const [items, setItems] = useState<RollItem[]>([]);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void listAllActiveItems().then((r) => {
      if (cancelled) return;
      setLoading(false);
      if (!r.ok) {
        setError(`${r.error.message} (${r.error.code})`);
        return;
      }
      const raw = r.data ?? [];
      const lowStock = raw
        .filter((it) => it.remainingMeters <= it.minimumMeters)
        .sort((a, b) => a.remainingMeters - b.remainingMeters);
      setItems(lowStock);
      setTotalCount(raw.length);
    });
    return () => { cancelled = true; };
  }, []);

  if (loading) return <Skeleton />;

  if (error) {
    return (
      <section className="mx-auto max-w-5xl px-4 py-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700" role="alert">{error}</p>
        </div>
      </section>
    );
  }

  if (totalCount === 0) {
    return (
      <section className="mx-auto max-w-5xl px-4 py-6">
        <h1 className="text-xl font-semibold text-gray-900">Low stock</h1>
        <div className="mt-4 rounded-lg border border-gray-200 bg-white p-6 text-center">
          <p className="text-sm text-gray-700">No active items in inventory yet.</p>
        </div>
      </section>
    );
  }

  if (items.length === 0) {
    return (
      <section className="mx-auto max-w-5xl px-4 py-6">
        <h1 className="text-xl font-semibold text-gray-900">Low stock</h1>
        <div className="mt-4 rounded-lg border border-gray-200 bg-white p-6 text-center">
          <p className="text-sm text-gray-700">All items are above their minimum stock level.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-5xl px-4 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Low stock</h1>
        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
          {items.length} {items.length === 1 ? 'item' : 'items'}
        </span>
      </div>

      <ul className="mt-4 space-y-2">
        {items.map((item) => (
          <li
            key={item.itemId}
            className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3"
          >
            <div className="min-w-0">
              <p className="text-base font-medium text-gray-900">{item.sku}</p>
              <p className="text-sm text-gray-500">
                {formatMeters(item.remainingMeters)} remaining
                {' · '}
                {formatMeters(item.minimumMeters)} minimum
              </p>
            </div>
            <div className="flex flex-shrink-0 gap-2">
              <Link to={`/items/${item.itemId}`} className={BTN_SECONDARY}>
                View
              </Link>
              <Link to={`/rolls/${item.itemId}/adjust`} className={BTN_PRIMARY}>
                Adjust stock
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
