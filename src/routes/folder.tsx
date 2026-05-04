// Folder browse + create (PRJ-783) — Wave 2. One page handles BOTH root
// (parentId=null at `/`) and any nested folder (`/folders/:id`). Depth
// flows from the loaded folder's `depth` field — search threshold is the
// only hardcoded depth check. Live updates via `subscribeToFolderChildren`
// so cross-device creates appear within ~1s; local Firestore cache covers
// same-device creates instantly (no optimistic UI). ESL + mobile-first.

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import type { User as FirebaseUser } from 'firebase/auth';
import { subscribeToAuthState } from '@/lib/firebase/auth';
import {
  countActiveItemsInSubtree,
  createFolder,
  getFolderById,
  getFolderSubtreeIsEmpty,
  softDeleteFolder,
  subscribeToActiveItemsInFolder,
  subscribeToFolderChildren,
} from '@/lib/queries';
import LowStockBadge from '@/components/LowStockBadge';
import type { Folder, RollItem } from '@/lib/models';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import CreateUndoSnackbar from '@/components/CreateUndoSnackbar';
import BackButton from '@/components/BackButton';

const SEARCH_DEPTH_MIN = 4;
const BTN_PRIMARY =
  'inline-flex min-h-12 min-w-12 items-center justify-center rounded-md bg-gray-900 px-5 py-3 text-sm font-medium text-white disabled:opacity-50';
const BTN_SECONDARY =
  'inline-flex min-h-12 min-w-12 items-center justify-center rounded-md border border-gray-300 px-5 py-3 text-sm font-medium text-gray-800 disabled:opacity-50';
const INPUT =
  'mt-1 block w-full min-h-12 rounded-md border border-gray-300 px-3 py-2 text-base';

interface BreadcrumbEntry {
  folderId: string;
  /** `null` = root "Home" entry. */
  name: string | null;
}

// Lazy per-row count. Failed counts degrade silently to `—` and log
// the cause — no red error banner for an unimportant number.
function ChildRow({ folder }: { folder: Folder }) {
  const [count, setCount] = useState<number | null | 'loading'>('loading');
  useEffect(() => {
    let cancelled = false;
    setCount('loading');
    void countActiveItemsInSubtree(folder.folderId).then((r) => {
      if (cancelled) return;
      if (r.ok) setCount(r.data);
      else {
        // eslint-disable-next-line no-console -- non-fatal; debugging only.
        console.warn(`[folders] count failed for ${folder.folderId}: ${r.error.code} ${r.error.message}`);
        setCount(null);
      }
    });
    return () => { cancelled = true; };
  }, [folder.folderId]);
  return (
    <li>
      <Link
        to={`/folders/${folder.folderId}`}
        className="flex min-h-12 items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 hover:border-gray-300"
      >
        <span className="text-base font-medium text-gray-900">{folder.name}</span>
        <span className="ml-3 inline-flex items-center gap-2">
          {count === 'loading' ? (
            <span className="inline-block h-5 w-12 animate-pulse rounded-full bg-gray-200" />
          ) : (
            <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
              {count === null ? '—' : `${count} items`}
            </span>
          )}
          <span aria-hidden className="text-gray-400">&rsaquo;</span>
        </span>
      </Link>
    </li>
  );
}

interface NewFolderPanelProps {
  parentId: string | null;
  parentAncestors: string[];
  parentDepth: number | null;
  actorUid: string;
  onClose: () => void;
}

function NewFolderPanel(p: NewFolderPanelProps) {
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const trimmed = name.trim();
    if (trimmed === '') { setError('Please enter a folder name.'); return; }
    setSubmitting(true);
    const r = await createFolder({
      name: trimmed,
      parentId: p.parentId,
      parentAncestors: p.parentAncestors,
      parentDepth: p.parentDepth,
      actorUid: p.actorUid,
    });
    setSubmitting(false);
    if (!r.ok) { setError(`Could not create folder: ${r.error.message} (${r.error.code})`); return; }
    setName('');
    p.onClose();
    // The page's onSnapshot listener renders the new row.
  }, [name, p]);

  return (
    <form onSubmit={submit} className="rounded-lg border border-gray-200 bg-white p-4">
      <label className="block">
        <span className="text-sm font-medium text-gray-800">New folder name</span>
        <input
          type="text" value={name} onChange={(e) => setName(e.target.value)}
          autoComplete="off" autoFocus className={INPUT}
        />
      </label>
      {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="submit" disabled={submitting} className={BTN_PRIMARY}>
          {submitting ? 'Adding…' : 'Add folder'}
        </button>
        <button type="button" onClick={p.onClose} disabled={submitting} className={BTN_SECONDARY}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function Skeleton() {
  return (
    <section className="mx-auto max-w-2xl px-4 py-8">
      <div className="h-4 w-32 animate-pulse rounded bg-gray-200" />
      <div className="mt-3 mb-4 h-8 w-48 animate-pulse rounded bg-gray-200" />
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="h-12 w-28 animate-pulse rounded-md bg-gray-200" />
        <div className="h-12 w-24 animate-pulse rounded-md bg-gray-200" />
      </div>
      <ul className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <li key={i} className="h-12 animate-pulse rounded-lg bg-gray-100" />
        ))}
      </ul>
      <div className="mt-6">
        <div className="mb-2 h-4 w-16 animate-pulse rounded bg-gray-200" />
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-gray-100" />
          ))}
        </div>
      </div>
    </section>
  );
}
export function FolderBrowsePage({ parentId }: { parentId: string | null }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [authUser, setAuthUser] = useState<FirebaseUser | null | undefined>(undefined);
  useEffect(() => subscribeToAuthState((u) => setAuthUser(u)), []);

  // Cache-backed mount reads (PRJ-893): folder browse is a non-mutating
  // surface. Offline-friendly folder tree navigation is an explicit pilot
  // requirement (storeroom Wi-Fi is unreliable). Safety-critical writes
  // (stock adjust, staff admin) use server-authoritative reads on their
  // respective routes.
  const [retryToken, setRetryToken] = useState(0);
  const [currentFolder, setCurrentFolder] = useState<Folder | null | undefined>(undefined);
  const [currentError, setCurrentError] = useState<string | null>(null);
  useEffect(() => {
    if (authUser === undefined) return;
    let cancelled = false;
    setCurrentError(null);
    if (parentId === null) { setCurrentFolder(null); return; }
    setCurrentFolder(undefined);
    void getFolderById(parentId).then((r) => {
      if (cancelled) return;
      if (r.ok) {
        setCurrentFolder(r.data);
        if (r.data === null) setCurrentError('That folder no longer exists.');
      } else {
        setCurrentFolder(null);
        setCurrentError(`Could not load folder: ${r.error.message} (${r.error.code})`);
      }
    });
    return () => { cancelled = true; };
  }, [parentId, authUser, retryToken]);

  // Ancestor chips. Per-doc failure → fall back to short ID prefix so
  // the path stays clickable.
  const [ancestorEntries, setAncestorEntries] = useState<BreadcrumbEntry[]>([]);
  useEffect(() => {
    let cancelled = false;
    if (!currentFolder) { setAncestorEntries([]); return; }
    const ids = currentFolder.ancestors;
    if (ids.length === 0) { setAncestorEntries([]); return; }
    void Promise.all(ids.map((id) => getFolderById(id))).then((results) => {
      if (cancelled) return;
      setAncestorEntries(results.map((r, i) => {
        const id = ids[i] ?? '';
        return r.ok && r.data
          ? { folderId: id, name: r.data.name }
          : { folderId: id, name: `…${id.slice(-4)}` };
      }));
    });
    return () => { cancelled = true; };
  }, [currentFolder, retryToken]);

  // Live children subscription. Same auth-resolved gate as above.
  const [children, setChildren] = useState<Folder[] | undefined>(undefined);
  const [childrenError, setChildrenError] = useState<string | null>(null);
  useEffect(() => {
    if (authUser === undefined) return;
    setChildren(undefined);
    setChildrenError(null);
    return subscribeToFolderChildren(
      parentId,
      (next) => {
        setChildren([...next].sort((a, b) => a.name.localeCompare(b.name)));
        setChildrenError(null);
      },
      (e) => {
        setChildren([]);
        setChildrenError(`Could not load folders: ${e.message} (${e.code})`);
      },
    );
  }, [parentId, retryToken, authUser]);

  // PRJ-879: live items subscription in this folder.
  const [items, setItems] = useState<RollItem[] | undefined>(undefined);
  const [itemsError, setItemsError] = useState<string | null>(null);
  useEffect(() => {
    if (authUser === undefined || parentId === null) { setItems([]); setItemsError(null); return; }
    setItems(undefined);
    setItemsError(null);
    return subscribeToActiveItemsInFolder(
      parentId,
      (next) => {
        setItems(next);
        setItemsError(null);
      },
      (e) => {
        setItems([]);
        setItemsError(`Could not load items: ${e.message} (${e.code})`);
      },
    );
  }, [parentId, authUser, retryToken]);

  const PAGE_SIZE = 50;
  const [page, setPage] = useState(1);

  // Reset to page 1 when the folder changes.
  useEffect(() => { setPage(1); }, [parentId]);

  // Clamp page when item count shrinks (e.g. deletions).
  useEffect(() => {
    if (items) {
      const maxPage = Math.ceil(items.length / PAGE_SIZE) || 1;
      setPage((p) => (p > maxPage ? maxPage : p));
    }
  }, [items]);

  const pagedItems = useMemo(() => {
    if (!items) return undefined;
    const maxPage = Math.ceil(items.length / PAGE_SIZE) || 1;
    const effectivePage = Math.min(page, maxPage);
    const s = (effectivePage - 1) * PAGE_SIZE;
    return items.slice(s, s + PAGE_SIZE);
  }, [items, page]);

  const totalItems = items?.length ?? 0;
  const totalPages = Math.ceil(totalItems / PAGE_SIZE) || 1;
  const effectivePage = Math.min(page, totalPages);
  const start = totalItems === 0 ? 0 : (effectivePage - 1) * PAGE_SIZE + 1;
  const end = Math.min(effectivePage * PAGE_SIZE, totalItems);

  const [addOpen, setAddOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // PRJ-796: subtree emptiness check for folder delete.
  const [subtreeCheck, setSubtreeCheck] = useState<{ empty: boolean; itemCount: number; folderCount: number } | undefined>(undefined);
  useEffect(() => {
    if (authUser === undefined || parentId === null) { setSubtreeCheck(undefined); return; }
    let cancelled = false;
    setSubtreeCheck(undefined);
    void getFolderSubtreeIsEmpty(parentId).then((r) => {
      if (cancelled) return;
      if (r.ok) setSubtreeCheck(r.data);
      else setSubtreeCheck(undefined);
    });
    return () => { cancelled = true; };
  }, [authUser, parentId, retryToken, items, children]);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  const onDeleteFolder = async () => {
    if (!parentId || !authUser || !currentFolder) return;

    // Re-verify emptiness immediately before deleting. This is a UI-only
    // guard — Firestore client transactions cannot query collection counts,
    // so two staff acting concurrently could both pass this check before
    // either delete commits. That leaves active descendants under a deleted
    // parent (orphan corruption). This is an accepted v1 limitation per
    // PRJ-796: Rules cannot iterate folderAncestors[] and the audit log
    // (not Rules) is the recovery surface for staff self-corruption.
    const check = await getFolderSubtreeIsEmpty(parentId);
    if (!check.ok) {
      setDeleteError(`Could not verify folder contents: ${check.error.message}`);
      return;
    }
    if (!check.data.empty) {
      setDeleteError(`Cannot delete: folder contains ${check.data.itemCount} item(s) and ${check.data.folderCount} subfolder(s). Delete or move them first.`);
      setSubtreeCheck(check.data); // Update UI to reflect current state
      return;
    }

    setDeleteSubmitting(true);
    setDeleteError(null);
    const result = await softDeleteFolder(parentId, deleteReason, authUser.uid);
    setDeleteSubmitting(false);
    if (result.ok) {
      setDeleteOpen(false);
      navigate(currentFolder.parentId ? `/folders/${currentFolder.parentId}` : '/');
    } else {
      setDeleteError(result.error.message);
    }
  };

  const currentDepth = parentId === null ? 0 : currentFolder?.depth ?? 0;
  const showSearch = currentDepth >= SEARCH_DEPTH_MIN;

  const breadcrumbEntries = useMemo<BreadcrumbEntry[]>(() => {
    const home: BreadcrumbEntry = { folderId: '', name: null };
    if (parentId === null || !currentFolder) return [home];
    return [home, ...ancestorEntries, { folderId: currentFolder.folderId, name: currentFolder.name }];
  }, [parentId, currentFolder, ancestorEntries]);

  const filteredChildren = useMemo(() => {
    if (!children) return undefined;
    if (!showSearch) return children;
    const term = searchTerm.trim().toLowerCase();
    return term === '' ? children : children.filter((c) => c.name.toLowerCase().includes(term));
  }, [children, searchTerm, showSearch]);

  // Cannot create under a non-existent parent.
  const canCreate =
    parentId === null || (currentFolder !== null && currentFolder !== undefined);

  const isLoading =
    authUser === undefined ||
    currentFolder === undefined ||
    children === undefined;

  if (isLoading) {
    return <Skeleton />;
  }

  return (
    <section className="mx-auto max-w-2xl px-4 py-8">
      <Breadcrumbs items={breadcrumbEntries.map((e) => ({ label: e.name ?? 'Home', to: e.folderId === '' ? '/' : `/folders/${e.folderId}` }))} />
      <BackButton />

      {(() => {
        const state = location.state as Record<string, unknown> | null;
        const lastCreatedItemId = state?.lastCreatedItemId as string | undefined;
        const createdAt = state?.createdAt as number | undefined;
        if (lastCreatedItemId && createdAt && Date.now() - createdAt < 15_000 && authUser) {
          return (
            <CreateUndoSnackbar
              itemId={lastCreatedItemId}
              actorUid={authUser.uid}
              onDismiss={() => navigate('.', { replace: true, state: {} })}
            />
          );
        }
        return null;
      })()}

      <header className="mt-3 mb-4">
        <h1 className="text-2xl font-semibold text-gray-900">
          {parentId === null ? 'Home' : currentFolder?.name ?? ''}
        </h1>
        {currentError ? (
          <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-700" role="alert">{currentError}</p>
            <button
              type="button"
              onClick={() => setRetryToken((n) => n + 1)}
              className="mt-3 inline-flex min-h-12 min-w-12 items-center justify-center rounded-md border border-red-300 bg-white px-4 py-3 text-sm font-medium text-red-700"
            >Retry</button>
          </div>
        ) : null}
      </header>

      {canCreate && authUser ? (
        addOpen ? (
          <div className="mb-4">
            {/* Pass the parent's RAW ancestors — createFolder appends
                parentId once. Pre-appending would double-include and
                fail the Rules `ancestors == parent.ancestors.concat([parentId])`. */}
            <NewFolderPanel
              parentId={parentId}
              parentAncestors={
                parentId === null ? [] : currentFolder ? currentFolder.ancestors : []
              }
              parentDepth={parentId === null ? null : currentFolder?.depth ?? null}
              actorUid={authUser.uid}
              onClose={() => setAddOpen(false)}
            />
          </div>
        ) : (
          <div className="mb-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => setAddOpen(true)} className={BTN_PRIMARY}>
              New folder
            </button>
            {/* PRJ-784: items live inside folders, not at root. Hide the
                CTA on a deleted folder so users don't dead-end into the
                form (which then errors with "folder has been deleted"). */}
            {parentId !== null && currentFolder && currentFolder.deletedAt === null ? (
              <Link to={`/folders/${parentId}/items/new`} className={BTN_PRIMARY}>
                Add item
              </Link>
            ) : null}
            {/* PRJ-796: folder delete — only for non-root, signed-in users. */}
            {parentId !== null && authUser && currentFolder && currentFolder.deletedAt === null ? (
              subtreeCheck === undefined ? (
                <span className="inline-flex min-h-12 items-center justify-center rounded-md border border-gray-200 px-5 py-3 text-sm font-medium text-gray-400">
                  Checking contents…
                </span>
              ) : !subtreeCheck.empty ? (
                <span className="inline-flex min-h-12 items-center justify-center rounded-md border border-gray-200 px-5 py-3 text-sm font-medium text-gray-500">
                  Cannot delete: folder contains {subtreeCheck.itemCount} items and {subtreeCheck.folderCount} subfolders. Delete or move them first.
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setDeleteOpen(true)}
                  className={`${BTN_SECONDARY} text-red-700 border-red-300`}
                >
                  Delete folder
                </button>
              )
            ) : null}
          </div>
        )
      ) : null}

      {deleteOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
            <h2 className="text-base font-semibold text-gray-900">Delete this folder?</h2>
            <p className="mt-1 text-sm text-gray-700">
              You have 7 days to restore from Recently deleted.
            </p>
            <label className="mt-3 block">
              <span className="text-sm font-medium text-gray-800">Reason for deletion (optional)</span>
              <textarea
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                maxLength={100}
                rows={2}
                className="mt-1 block w-full min-h-12 rounded-md border border-gray-300 px-3 py-2 text-base"
              />
            </label>
            {deleteError ? <p className="mt-2 text-sm text-red-700" role="alert">{deleteError}</p> : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => { void onDeleteFolder(); }}
                disabled={deleteSubmitting}
                className={`${BTN_PRIMARY} bg-red-700`}
              >
                {deleteSubmitting ? 'Deleting…' : 'Delete'}
              </button>
              <button
                type="button"
                onClick={() => { setDeleteOpen(false); setDeleteError(null); }}
                disabled={deleteSubmitting}
                className={BTN_SECONDARY}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showSearch ? (
        <div className="mb-4">
          <label className="block">
            <span className="text-sm font-medium text-gray-800">Search this folder</span>
            <input
              type="search" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Type a folder name" className={INPUT}
            />
          </label>
        </div>
      ) : null}

      {childrenError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700" role="alert">{childrenError}</p>
          <button
            type="button" onClick={() => setRetryToken((n) => n + 1)}
            className="mt-3 inline-flex min-h-12 min-w-12 items-center justify-center rounded-md border border-red-300 bg-white px-4 py-3 text-sm font-medium text-red-700"
          >Retry</button>
        </div>
      ) : filteredChildren && filteredChildren.length > 0 ? (
        <ul className="space-y-2">
          {filteredChildren.map((c) => <ChildRow key={c.folderId} folder={c} />)}
        </ul>
      ) : (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center">
          <p className="text-sm text-gray-700">
            {showSearch && searchTerm.trim() !== ''
              ? 'No folders match that name.'
              : "No folders yet — tap 'New folder' to start."}
          </p>
        </div>
      )}

      {/* PRJ-784: items live INSIDE folders, not at root. Hide on a
          deleted folder for parity with the "Add item" CTA — rules
          would reject the resulting edit anyway. Surface query errors
          so backend failures don't masquerade as empty inventory. */}
      {parentId !== null && currentFolder && currentFolder.deletedAt === null ? (
        itemsError ? (
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-700" role="alert">{itemsError}</p>
            <button type="button" onClick={() => setRetryToken((n) => n + 1)}
              className="mt-3 inline-flex min-h-12 min-w-12 items-center justify-center rounded-md border border-red-300 bg-white px-4 py-3 text-sm font-medium text-red-700">Retry</button>
          </div>
        ) : items === undefined ? (
          <div className="mt-6">
            <h2 className="mb-2 text-sm font-medium text-gray-700">Items</h2>
            <ul className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <li key={i} className="h-12 animate-pulse rounded-lg bg-gray-100" />
              ))}
            </ul>
          </div>
        ) : pagedItems && pagedItems.length > 0 ? (
          <div className="mt-6">
            <h2 className="mb-2 text-sm font-medium text-gray-700">Items</h2>
            <ul className="space-y-2">
              {pagedItems.map((it) => (
                <li key={it.itemId}>
                  {/* PRJ-789: item rows tap into the detail page (Adjust + history); /edit is reachable via the "Edit metadata" action there. */}
                  <Link to={`/items/${it.itemId}`}
                    className="flex min-h-12 items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 hover:border-gray-300">
                    <span className="text-base font-medium text-gray-900">{it.sku}</span>
                    <span className="ml-3 inline-flex items-center gap-2">
                      <LowStockBadge remainingMeters={it.remainingMeters} minimumMeters={it.minimumMeters} />
                      <span className="text-xs text-gray-600">{it.remainingMeters} m</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex items-center justify-between gap-2">
              <button
                type="button"
                disabled={effectivePage <= 1}
                onClick={() => setPage(effectivePage - 1)}
                className={BTN_SECONDARY}
              >
                Previous
              </button>
              <span className="text-sm text-gray-600">
                Showing {start}–{end} of {totalItems}
              </span>
              <button
                type="button"
                disabled={effectivePage >= totalPages}
                onClick={() => setPage(effectivePage + 1)}
                className={BTN_SECONDARY}
              >
                Next
              </button>
            </div>
          </div>
        ) : null
      ) : null}
    </section>
  );
}

export default function FolderRoute() {
  // `key` re-mounts on URL change so internal effects re-run cleanly
  // and intermediate states from the previous folder don't flicker.
  const id = useParams<{ id: string }>().id ?? null;
  return <FolderBrowsePage key={id ?? 'root'} parentId={id} />;
}
