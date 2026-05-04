import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { getItemById } from '@/lib/queries';
import type { RollItem } from '@/lib/models';
import RollLabel from '@/components/RollLabel';
import BackButton from '@/components/BackButton';

const VALID_SIZES = ['default', 'small'] as const;
type ValidSize = (typeof VALID_SIZES)[number];

function isValidSize(v: string | null): v is ValidSize {
  return VALID_SIZES.includes(v as ValidSize);
}

export default function PrintLabelRoute() {
  const { itemId } = useParams<{ itemId: string }>();
  const [searchParams] = useSearchParams();
  const rawSize = searchParams.get('size');
  const size: ValidSize = isValidSize(rawSize) ? rawSize : 'default';

  const [item, setItem] = useState<RollItem | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!itemId) { setItem(null); setError(null); return; }
    setError(null);
    let cancelled = false;
    void getItemById(itemId).then((r) => {
      if (cancelled) return;
      if (!r.ok) { setError(r.error.message); setItem(null); return; }
      setItem(r.data);
    });
    return () => { cancelled = true; };
  }, [itemId]);

  // Inject dynamic @page size based on label dimension
  const pageSizeCss = useMemo(() => {
    const dim = size === 'small' ? '30mm 38mm' : '50mm 62mm';
    return `@page { size: ${dim}; margin: 0; }`;
  }, [size]);

  useEffect(() => {
    document.body.classList.add('label-print-mode');
    const style = document.createElement('style');
    style.setAttribute('data-print-label-page', '');
    style.textContent = pageSizeCss;
    document.head.appendChild(style);
    return () => {
      document.body.classList.remove('label-print-mode');
      document.head.querySelectorAll('style[data-print-label-page]').forEach((el) => el.remove());
    };
  }, [pageSizeCss]);

  useEffect(() => {
    if (!item) return;
    // Skip auto-print if QR host is not configured — printing the error
    // fallback is not useful and wastes label stock.
    const host = import.meta.env.VITE_PUBLIC_HOST;
    if (!host || typeof host !== 'string' || host.trim() === '') return;
    const t = window.setTimeout(() => window.print(), 400);
    return () => window.clearTimeout(t);
  }, [item]);

  if (!itemId) {
    return <p className="p-4 text-sm text-red-700">Missing item id.</p>;
  }

  if (error) {
    return <p className="p-4 text-sm text-red-700">Could not load item: {error}</p>;
  }

  if (item === undefined) {
    return <p className="p-4 text-sm text-gray-600">Loading…</p>;
  }

  if (item === null) {
    return <p className="p-4 text-sm text-red-700">Item not found.</p>;
  }

  return (
    <section className="flex min-h-screen flex-col items-center justify-center bg-white p-0">
      <div className="print-hide absolute top-4 left-4">
        <BackButton fallbackTo="/" />
      </div>
      <RollLabel
        itemId={item.itemId}
        size={size}
        printable
        sku={item.sku}
        name={item.description}
      />
    </section>
  );
}
