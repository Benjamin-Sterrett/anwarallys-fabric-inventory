import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { listAllActiveItems } from '@/lib/queries';
import type { RollItem } from '@/lib/models';
import RollLabel from '@/components/RollLabel';
import BackButton from '@/components/BackButton';

const VALID_SIZES = ['default', 'small'] as const;
type ValidSize = (typeof VALID_SIZES)[number];

function isValidSize(v: string | null): v is ValidSize {
  return VALID_SIZES.includes(v as ValidSize);
}

export default function PrintLabelsRoute() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawSize = searchParams.get('size');
  const size: ValidSize = isValidSize(rawSize) ? rawSize : 'default';

  const [items, setItems] = useState<RollItem[] | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listAllActiveItems().then((r) => {
      if (cancelled) return;
      if (!r.ok) { setError(r.error.message); setItems([]); return; }
      setItems(r.data);
    });
    return () => { cancelled = true; };
  }, []);

  const gridStyle = useMemo<React.CSSProperties>(() => ({
    display: 'grid',
    gridTemplateColumns: `repeat(auto-fill, ${size === 'small' ? '30mm' : '50mm'})`,
    gap: '0',
  }), [size]);

  const handleSizeChange = (v: ValidSize) => {
    setSearchParams({ size: v });
  };

  // Inject zero-margin @page for batch print so labels align with stock.
  useEffect(() => {
    document.body.classList.add('label-print-mode');
    const style = document.createElement('style');
    style.setAttribute('data-print-labels-page', '');
    style.textContent = '@page { margin: 0; }';
    document.head.appendChild(style);
    return () => {
      document.body.classList.remove('label-print-mode');
      document.head.querySelectorAll('style[data-print-labels-page]').forEach((el) => el.remove());
    };
  }, []);

  return (
    <section className="bg-white p-4 print:p-0">
      <div className="print-hide mb-4 flex flex-wrap items-center gap-3">
        <BackButton fallbackTo="/" />
        <h1 className="text-lg font-semibold text-gray-900">Print labels</h1>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          Size
          <select
            className="rounded-md border border-gray-300 px-2 py-1 text-sm"
            value={size}
            onChange={(e) => handleSizeChange(e.target.value as ValidSize)}
          >
            <option value="default">50 mm</option>
            <option value="small">30 mm</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => window.print()}
          disabled={items === undefined || items === null || items.length === 0 || !import.meta.env.VITE_PUBLIC_HOST}
          className="inline-flex items-center rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          Print
        </button>
      </div>

      {error ? (
        <p className="text-sm text-red-700">Could not load items: {error}</p>
      ) : items === undefined ? (
        <p className="text-sm text-gray-600">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-700">No active items.</p>
      ) : (
        <div style={gridStyle}>
          {items.map((item) => (
            <RollLabel
              key={item.itemId}
              itemId={item.itemId}
              size={size}
              printable
              sku={item.sku}
              name={item.description}
            />
          ))}
        </div>
      )}
    </section>
  );
}
