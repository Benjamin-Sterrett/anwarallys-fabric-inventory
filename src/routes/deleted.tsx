// Recently deleted view (PRJ-796 + PRJ-797 + PRJ-923). Lists soft-deleted
// items and folders within the 7-day retention window and allows restore.

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Timestamp } from 'firebase/firestore';
import { subscribeToAuthState } from '@/lib/firebase/auth';
import {
  subscribeToDeletedItems,
  subscribeToDeletedFolders,
  subscribeToAllUsers,
  subscribeToAllFolders,
  restoreItem,
  restoreFolder,
} from '@/lib/queries';
import type { RollItem, Folder, User } from '@/lib/models';
import BackButton from '@/components/BackButton';

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

function buildBreadcrumb(
  ancestorIds: string[],
  folderNameMap: Map<string, string>,
): string {
  if (ancestorIds.length === 0) return 'Home';
  return ancestorIds
    .map((id) => folderNameMap.get(id) || `…${id.slice(-4)}`)
    .join(' > ');
}

interface RestoreModalState {
  type: 'item' | 'folder';
  id: string;
  name: string;
}

function RestoreConfirmModal({
  state,
  onConfirm,
  onCancel,
  error,
  loading,
}: {
  state: RestoreModalState;
  onConfirm: () => void;
  onCancel: () => void;
  error: string | null;
  loading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-lg">
        <h3 className="text-lg font-semibold text-gray-900">
          Restore {state.type === 'item' ? 'item' : 'folder'}?
        </h3>
        <p className="mt-2 text-sm text-gray-600">
          “{state.name}” will appear in its previous location again.
        </p>
        {error ? (
          <p className="mt-3 text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Restoring…' : 'Restore'}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeletedItemsSection({
  items,
  onRestore,
  canRestore,
  displayNameMap,
  folderNameMap,
  deletedFolderIds,
}: {
  items: RollItem[];
  onRestore: (item: RollItem) => void;
  canRestore: (item: RollItem) => boolean;
  displayNameMap: Map<string, string>;
  folderNameMap: Map<string, string>;
  deletedFolderIds: Set<string>;
}) {
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
            {(() => {
              const expired = !canRestore(item);
              const parentDeleted = deletedFolderIds.has(item.folderId);
              const disabled = expired || parentDeleted;
              const title = parentDeleted
                ? 'Restore the parent folder first'
                : expired
                  ? 'Restore window has expired'
                  : undefined;
              return (
                <button
                  type="button"
                  onClick={() => onRestore(item)}
                  disabled={disabled}
                  title={title}
                  className="inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {parentDeleted ? 'Unavailable' : expired ? 'Expired' : 'Restore'}
                </button>
              );
            })()}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
            <span className="truncate max-w-[200px]">
              {buildBreadcrumb(item.folderAncestors, folderNameMap)}
            </span>
            <span aria-hidden className="text-gray-300">·</span>
            <span>{displayNameMap.get(item.deletedBy || '') || item.deletedBy || '—'}</span>
            <span aria-hidden className="text-gray-300">·</span>
            {item.deletedAt instanceof Timestamp ? (
              <span title={item.deletedAt.toDate().toLocaleString()}>{formatRelative(item.deletedAt)}</span>
            ) : (
              <span>—</span>
            )}
            {item.deleteReason ? (
              <>
                <span aria-hidden className="text-gray-300">·</span>
                <span className="text-amber-700">{item.deleteReason}</span>
              </>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

function DeletedFoldersSection({
  folders,
  onRestore,
  canRestore,
  displayNameMap,
  folderNameMap,
  deletedFolderIds,
}: {
  folders: Folder[];
  onRestore: (folder: Folder) => void;
  canRestore: (folder: Folder) => boolean;
  displayNameMap: Map<string, string>;
  folderNameMap: Map<string, string>;
  deletedFolderIds: Set<string>;
}) {
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
                {folder.parentId === null
                  ? 'Root'
                  : `Parent: ${buildBreadcrumb(folder.ancestors, folderNameMap)}`}
              </p>
            </div>
            {(() => {
              const expired = !canRestore(folder);
              const parentDeleted = folder.parentId !== null && deletedFolderIds.has(folder.parentId);
              const disabled = expired || parentDeleted;
              const title = parentDeleted
                ? 'Restore the parent folder first'
                : expired
                  ? 'Restore window has expired'
                  : undefined;
              return (
                <button
                  type="button"
                  onClick={() => onRestore(folder)}
                  disabled={disabled}
                  title={title}
                  className="inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {parentDeleted ? 'Unavailable' : expired ? 'Expired' : 'Restore'}
                </button>
              );
            })()}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
            <span>{displayNameMap.get(folder.deletedBy || '') || folder.deletedBy || '—'}</span>
            <span aria-hidden className="text-gray-300">·</span>
            {folder.deletedAt instanceof Timestamp ? (
              <span title={folder.deletedAt.toDate().toLocaleString()}>{formatRelative(folder.deletedAt)}</span>
            ) : (
              <span>—</span>
            )}
            {folder.deleteReason ? (
              <>
                <span aria-hidden className="text-gray-300">·</span>
                <span className="text-amber-700">{folder.deleteReason}</span>
              </>
            ) : null}
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

  const [users, setUsers] = useState<User[] | undefined>(undefined);
  useEffect(() => {
    if (authUser === undefined) return;
    return subscribeToAllUsers(
      (next) => setUsers(next),
      () => setUsers([]),
    );
  }, [authUser]);

  const [allFolders, setAllFolders] = useState<Folder[] | undefined>(undefined);
  useEffect(() => {
    if (authUser === undefined) return;
    return subscribeToAllFolders(
      (next) => setAllFolders(next),
      () => setAllFolders([]),
    );
  }, [authUser]);

  const displayNameMap = useMemo(() => {
    const map = new Map<string, string>();
    if (users) {
      for (const u of users) {
        map.set(u.uid, u.displayName);
      }
    }
    return map;
  }, [users]);

  const folderNameMap = useMemo(() => {
    const map = new Map<string, string>();
    if (allFolders) {
      for (const f of allFolders) {
        map.set(f.folderId, f.name);
      }
    }
    return map;
  }, [allFolders]);

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  const RETENTION_MS = 7 * 24 * 60 * 60 * 1000 + 5 * 60 * 1000;
  const RESTORE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
  const filteredItems = useMemo(() =>
    items?.filter(item => item.deletedAt instanceof Timestamp && item.deletedAt.toMillis() >= now - RETENTION_MS) ?? [],
  [items, now]);
  const filteredFolders = useMemo(() =>
    folders?.filter(folder => folder.deletedAt instanceof Timestamp && folder.deletedAt.toMillis() >= now - RETENTION_MS) ?? [],
  [folders, now]);
  const deletedFolderIds = useMemo(() => {
    const set = new Set<string>();
    for (const f of filteredFolders) {
      set.add(f.folderId);
    }
    return set;
  }, [filteredFolders]);
  const canRestoreItem = (item: RollItem) =>
    item.deletedAt instanceof Timestamp && item.deletedAt.toMillis() >= now - RESTORE_WINDOW_MS;
  const canRestoreFolder = (folder: Folder) =>
    folder.deletedAt instanceof Timestamp && folder.deletedAt.toMillis() >= now - RESTORE_WINDOW_MS;

  const [restoreModal, setRestoreModal] = useState<RestoreModalState | null>(null);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [itemRestoreSuccess, setItemRestoreSuccess] = useState<string | null>(null);
  const [folderRestoreSuccess, setFolderRestoreSuccess] = useState<string | null>(null);

  const openItemRestore = (item: RollItem) => {
    if (!canRestoreItem(item)) {
      setRestoreError('Restore window has expired.');
      return;
    }
    setRestoreError(null);
    setRestoreModal({ type: 'item', id: item.itemId, name: item.sku });
  };

  const openFolderRestore = (folder: Folder) => {
    if (!canRestoreFolder(folder)) {
      setRestoreError('Restore window has expired.');
      return;
    }
    setRestoreError(null);
    setRestoreModal({ type: 'folder', id: folder.folderId, name: folder.name });
  };

  const confirmRestore = async () => {
    if (!restoreModal || !authUser) return;
    setRestoreLoading(true);
    setRestoreError(null);

    if (restoreModal.type === 'item') {
      const result = await restoreItem(restoreModal.id, authUser.uid);
      setRestoreLoading(false);
      if (result.ok) {
        setItemRestoreSuccess(`Restored “${restoreModal.name}”.`);
        setItems((prev) => prev?.filter((i) => i.itemId !== restoreModal.id));
        setRestoreModal(null);
        setTimeout(() => setItemRestoreSuccess(null), 3000);
      } else {
        setRestoreError(result.error.message);
      }
    } else {
      const result = await restoreFolder(restoreModal.id, authUser.uid);
      setRestoreLoading(false);
      if (result.ok) {
        setFolderRestoreSuccess(`Restored folder “${restoreModal.name}”.`);
        setFolders((prev) => prev?.filter((f) => f.folderId !== restoreModal.id));
        setRestoreModal(null);
        setTimeout(() => setFolderRestoreSuccess(null), 3000);
      } else {
        setRestoreError(result.error.message);
      }
    }
  };

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
      <BackButton />

      <h1 className="text-2xl font-semibold text-gray-900">Recently deleted</h1>
      <p className="mt-1 text-sm text-gray-600">Items and folders deleted in the last 7 days.</p>

      {itemRestoreSuccess ? (
        <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3">
          <p className="text-sm text-green-800" role="status">{itemRestoreSuccess}</p>
        </div>
      ) : null}

      <div className="mt-6">
        <h2 className="mb-2 text-sm font-medium text-gray-700">Deleted items</h2>
        {itemsError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-700" role="alert">Could not load deleted items: {itemsError}</p>
          </div>
        ) : (
          <DeletedItemsSection
            items={filteredItems}
            onRestore={openItemRestore}
            canRestore={canRestoreItem}
            displayNameMap={displayNameMap}
            folderNameMap={folderNameMap}
            deletedFolderIds={deletedFolderIds}
          />
        )}
      </div>

      {folderRestoreSuccess ? (
        <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3">
          <p className="text-sm text-green-800" role="status">{folderRestoreSuccess}</p>
        </div>
      ) : null}

      <div className="mt-6">
        <h2 className="mb-2 text-sm font-medium text-gray-700">Deleted folders</h2>
        {foldersError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-700" role="alert">Could not load deleted folders: {foldersError}</p>
          </div>
        ) : (
          <DeletedFoldersSection
            folders={filteredFolders}
            onRestore={openFolderRestore}
            canRestore={canRestoreFolder}
            displayNameMap={displayNameMap}
            folderNameMap={folderNameMap}
            deletedFolderIds={deletedFolderIds}
          />
        )}
      </div>

      {restoreModal ? (
        <RestoreConfirmModal
          state={restoreModal}
          onConfirm={confirmRestore}
          onCancel={() => setRestoreModal(null)}
          error={restoreError}
          loading={restoreLoading}
        />
      ) : null}
    </section>
  );
}
