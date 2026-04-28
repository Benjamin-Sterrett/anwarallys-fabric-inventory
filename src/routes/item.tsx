import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { User as FirebaseUser } from 'firebase/auth';
import { subscribeToAuthState } from '@/lib/firebase/auth';
import { getFolderById, getItemById, getItemByIdFromServer } from '@/lib/queries';
import type { RollItem } from '@/lib/models';
import RollLabel from '@/components/RollLabel';

const BTN_BASE = 'inline-flex min-h-12 min-w-12 items-center justify-center rounded-md px-5 py-3 text-sm font-medium disabled:opacity-50';
const BTN_PRIMARY = `${BTN_BASE} bg-gray-900 text-white`;
const BTN_SECONDARY = `${BTN_BASE} border border-gray-300 text-gray-800`;

const round2dp = (n: number): number => Math.round(n * 100) / 100;
function formatMeters(n: number): string {
  if (!Number.isFinite(n)) return '–';
  return `${round2dp(n)} m`;
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

function Skeleton({ itemId }: { itemId: string }) {
  return (
    <section className="mx-auto max-w-2xl px-4 py-8">
      <p className="text-xs text-gray-500">ID: {itemId}</p>
      <div className="mt-4 space-y-3">
        <div className="h-6 w-3/4 animate-pulse rounded bg-gray-200" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-gray-200" />
        <div className="h-32 animate-pulse rounded-lg bg-gray-100" />
        <div className="flex gap-2">
          <div className="h-12 w-32 animate-pulse rounded bg-gray-200" />
          <div className="h-12 w-32 animate-pulse rounded bg-gray-200" />
          <div className="h-12 w-32 animate-pulse rounded bg-gray-200" />
        </div>
      </div>
    </section>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <section className="mx-auto max-w-2xl px-4 py-8">
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <p className="text-sm text-red-700" role="alert">{message}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={onRetry} className={BTN_SECONDARY}>Retry</button>
          <Link to="/" className={BTN_SECONDARY}>Browse inventory</Link>
        </div>
      </div>
    </section>
  );
}

type LoadState =
  | { kind: 'auth-loading' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'not-found' }
  | { kind: 'soft-deleted' }
  | { kind: 'active'; item: RollItem };

function ItemPage({ itemId }: { itemId: string }) {
  const [authUser, setAuthUser] = useState<FirebaseUser | null | undefined>(undefined);
  const navigate = useNavigate();

  useEffect(() => {
    const unsub = subscribeToAuthState((u) => setAuthUser(u));
    return unsub;
  }, []);

  useEffect(() => {
    if (authUser === null) {
      const continueParam = encodeURIComponent(`/i/${itemId}`);
      navigate(`/login?continue=${continueParam}`, { replace: true });
    }
  }, [authUser, navigate, itemId]);

  const [loadState, setLoadState] = useState<LoadState>({ kind: 'auth-loading' });
  const [breadcrumbEntries, setBreadcrumbEntries] = useState<BreadcrumbEntry[]>([]);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    if (authUser === undefined || authUser === null) return;
    let cancelled = false;
    setLoadState({ kind: 'loading' });
    void getItemByIdFromServer(itemId).then((r) => {
      if (cancelled) return;
      if (!r.ok) {
        if (r.error.code === 'firestore/unavailable') {
          // Flaky storeroom Wi-Fi — fall back to cache so QR scans still work offline.
          void getItemById(itemId, { includeDeleted: true }).then((rCache) => {
            if (cancelled) return;
            if (!rCache.ok) {
              setLoadState({ kind: 'error', message: `${rCache.error.message} (${rCache.error.code})` });
              return;
            }
            if (rCache.data) {
              if (rCache.data.deletedAt !== null) {
                setLoadState({ kind: 'soft-deleted' });
              } else {
                setLoadState({ kind: 'active', item: rCache.data });
              }
              return;
            }
            // Cache miss and offline — can't distinguish soft-delete from not-found.
            // Show not-found rather than a scary error.
            setLoadState({ kind: 'not-found' });
          });
          return;
        }
        setLoadState({ kind: 'error', message: `${r.error.message} (${r.error.code})` });
        return;
      }
      if (r.data) {
        setLoadState({ kind: 'active', item: r.data });
        return;
      }
      // null — may be soft-deleted or truly missing
      void getItemById(itemId, { includeDeleted: true }).then((r2) => {
        if (cancelled) return;
        if (!r2.ok) {
          setLoadState({ kind: 'error', message: `${r2.error.message} (${r2.error.code})` });
          return;
        }
        if (r2.data && r2.data.deletedAt !== null) {
          // Restore window check lives on the server (firestore.rules).
          // UI shows soft-deleted for any deleted item; server rejects
          // restore if the window has expired. This avoids client clock skew.
          setLoadState({ kind: 'soft-deleted' });
          return;
        }
        // Live doc is gone. A tombstone means the item was deleted, but
        // without the live doc it is no longer restorable (restore requires
        // the live /items/{id} doc with deletedAt != null). Treat as not-found
        // so staff don't chase a restore path that cannot succeed.
        setLoadState({ kind: 'not-found' });
      });
    });
    return () => { cancelled = true; };
  }, [authUser, itemId, retryToken]);

  useEffect(() => {
    if (loadState.kind !== 'active') { setBreadcrumbEntries([]); return; }
    const item = loadState.item;
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
  }, [loadState]);

  if (authUser === undefined || authUser === null || loadState.kind === 'auth-loading' || loadState.kind === 'loading') {
    return <Skeleton itemId={itemId} />;
  }

  if (loadState.kind === 'error') {
    return <ErrorState message={loadState.message} onRetry={() => setRetryToken((n) => n + 1)} />;
  }

  if (loadState.kind === 'not-found') {
    return (
      <section className="mx-auto max-w-2xl px-4 py-8">
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-center">
          <h1 className="text-xl font-semibold text-gray-900">Roll not found</h1>
          <p className="mt-2 text-sm text-gray-700">It may have been deleted.</p>
          <Link to="/" className={`${BTN_SECONDARY} mt-6`}>Browse inventory</Link>
        </div>
      </section>
    );
  }

  if (loadState.kind === 'soft-deleted') {
    return (
      <section className="mx-auto max-w-2xl px-4 py-8">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-center">
          <h1 className="text-xl font-semibold text-amber-900">This roll is in Recently Deleted</h1>
          <p className="mt-2 text-sm text-gray-700">
            Ask an admin to restore it from Recently Deleted, or return to inventory.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Link to="/" className={BTN_SECONDARY}>Browse inventory</Link>
          </div>
        </div>
      </section>
    );
  }

  const item = loadState.item;
  const isLowStock = item.remainingMeters <= item.minimumMeters;

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
        <div className="flex items-center gap-3">
          <p className="text-[32px] font-semibold text-gray-900">{formatMeters(item.remainingMeters)}</p>
          {isLowStock ? (
            <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
              Low stock
            </span>
          ) : null}
        </div>
        <p className="text-xs uppercase tracking-wide text-gray-500">On hand</p>
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
        <Link to={`/items/${item.itemId}/adjust`} className={BTN_PRIMARY}>Adjust stock</Link>
        <Link to={`/items/${item.itemId}`} className={BTN_SECONDARY}>View history</Link>
        <Link to={`/print/label/${item.itemId}`} className={BTN_SECONDARY}>Print label</Link>
      </div>
    </section>
  );
}

export default function ItemRoute() {
  const itemId = useParams<{ itemId: string }>().itemId ?? '';
  if (!itemId) {
    return (
      <section className="mx-auto max-w-2xl px-4 py-8">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700" role="alert">Missing item id in URL.</p>
          <Link to="/" className={`${BTN_SECONDARY} mt-3`}>Browse inventory</Link>
        </div>
      </section>
    );
  }
  return <ItemPage key={itemId} itemId={itemId} />;
}
