// Recently deleted view (PRJ-796). Lists soft-deleted items and folders
// within the 7-day retention window. Restore is disabled until PRJ-797.

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Timestamp } from 'firebase/firestore';
import { subscribeToAuthState } from '@/lib/firebase/auth';
import { subscribeToDeletedItems, subscribeToDeletedFolders } from '@/lib/queries';
import type { RollItem, Folder } from '@/lib/models';

function formatRelative(ts: Timestamp): string {
  const ms = ts.toMillis();
  const delta = Math.max(0, Date.now() - ms);
  const sec = Math.round(delta / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}

function DeletedItemsSection({ items }: { items: RollItem[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center">
        <p className="text-sm text-gray-700">No deleted items in the last 7 days.</p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item.itemId} className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900">{item.sku}</p>
              {item.description ? (
                <p className="mt-0.5 truncate text-xs text-gray-600">{item.description}</p>
              ) : null}
            </div>
            <button
              type="button"
              disabled
              title="Available in PRJ-797"
              className="inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-400 disabled:opacity-50"
            >
              Restore
            </button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
            <span>
              {item.folderAncestors.length > 0
                ? `…${item.folderAncestors[item.folderAncestors.length - 1]?.slice(-4) ?? ''}`
                : 'Home'}
            </span>
            <span aria-hidden className="text-gray-300">·</span>
            <span>{item.deletedBy ?? '—'}</span>
            <span aria-hidden className="text-gray-300">·</span>
            {item.deletedAt instanceof Timestamp ? (
              <span title={item.deletedAt.toDate().toLocaleString()}>{formatRelative(item.deletedAt)}</span>
            ) : (
              <span>—</span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function DeletedFoldersSection({ folders }: { folders: Folder[] }) {
  if (folders.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center">
        <p className="text-sm text-gray-700">No deleted folders in the last 7 days.</p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {folders.map((folder) => (
        <li key={folder.folderId} className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900">{folder.name}</p>
              <p className="mt-0.5 text-xs text-gray-600">
                {folder.parentId === null ? 'Root' : `Parent: …${folder.parentId.slice(-4)}`}
              </p>
            </div>
            <button
              type="button"
              disabled
              title="Available in PRJ-797"
              className="inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-400 disabled:opacity-50"
            >
              Restore
            </button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
            <span>{folder.deletedBy ?? '—'}</span>
            <span aria-hidden className="text-gray-300">·</span>
            {folder.deletedAt instanceof Timestamp ? (
              <span title={folder.deletedAt.toDate().toLocaleString()}>{formatRelative(folder.deletedAt)}</span>
            ) : (
              <span>—</span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function DeletedRoute() {
  const [authUser, setAuthUser] = useState<import('firebase/auth').User | null | undefined>(undefined);
  useEffect(() => subscribeToAuthState((u) => setAuthUser(u)), []);

  const [items, setItems] = useState<RollItem[] | undefined>(undefined);
  const [itemsError, setItemsError] = useState<string | null>(null);
  useEffect(() => {
    if (authUser === undefined) return;
    setItems(undefined);
    setItemsError(null);
    return subscribeToDeletedItems(
      (next) => { setItems(next); setItemsError(null); },
      (e) => { setItems([]); setItemsError(`${e.message} (${e.code})`); },
    );
  }, [authUser]);

  const [folders, setFolders] = useState<Folder[] | undefined>(undefined);
  const [foldersError, setFoldersError] = useState<string | null>(null);
  useEffect(() => {
    if (authUser === undefined) return;
    setFolders(undefined);
    setFoldersError(null);
    return subscribeToDeletedFolders(
      (next) => { setFolders(next); setFoldersError(null); },
      (e) => { setFolders([]); setFoldersError(`${e.message} (${e.code})`); },
    );
  }, [authUser]);

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  // Retention window matches the tombstone's expireAt: 7 days + 5-minute
  // safety buffer (PRJ-805). Using deletedAt + 7d alone would hide items
  // during the final 5 minutes when the tombstone is still restorable.
  const RETENTION_MS = 7 * 24 * 60 * 60 * 1000 + 5 * 60 * 1000;
  const filteredItems = useMemo(() =>
    items?.filter(item => item.deletedAt instanceof Timestamp && item.deletedAt.toMillis() >= now - RETENTION_MS) ?? [],
  [items, now]);
  const filteredFolders = useMemo(() =>
    folders?.filter(folder => folder.deletedAt instanceof Timestamp && folder.deletedAt.toMillis() >= now - RETENTION_MS) ?? [],
  [folders, now]);

  const loading = authUser === undefined || (authUser !== null && (items === undefined || folders === undefined));
  if (loading) {
    return (
      <section className="mx-auto max-w-2xl px-4 py-8">
        <div className="mb-2 h-6 w-48 animate-pulse rounded bg-gray-200" />
        <div className="mt-4 space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-gray-100" />
          ))}
        </div>
      </section>
    );
  }

  if (authUser === null) {
    return (
      <section className="mx-auto max-w-2xl px-4 py-8">
        <p className="text-sm text-red-700">You must be signed in.</p>
        <Link to="/login" className="mt-3 inline-flex min-h-12 min-w-12 items-center justify-center rounded-md border border-gray-300 px-5 py-3 text-sm font-medium text-gray-800">
          Sign in
        </Link>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-semibold text-gray-900">Recently deleted</h1>
      <p className="mt-1 text-sm text-gray-600">Items and folders deleted in the last 7 days.</p>

      <div className="mt-6">
        <h2 className="mb-2 text-sm font-medium text-gray-700">Deleted items</h2>
        {itemsError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-700" role="alert">Could not load deleted items: {itemsError}</p>
          </div>
        ) : (
          <DeletedItemsSection items={filteredItems} />
        )}
      </div>

      <div className="mt-6">
        <h2 className="mb-2 text-sm font-medium text-gray-700">Deleted folders</h2>
        {foldersError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-700" role="alert">Could not load deleted folders: {foldersError}</p>
          </div>
        ) : (
          <DeletedFoldersSection folders={filteredFolders} />
        )}
      </div>
    </section>
  );
}
