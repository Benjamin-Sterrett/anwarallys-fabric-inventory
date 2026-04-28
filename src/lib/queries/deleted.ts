// Soft-delete queries (PRJ-796). Items get tombstones in /deletedRecords;
// folders are marked deleted in-place (no tombstone collection).

import { FirebaseError } from 'firebase/app';
import {
  collection,
  doc,
  getCountFromServer,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  where,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore';
import { getDb } from '@/lib/firebase/app';
import { deletedRecordConverter, itemConverter, folderConverter } from '@/lib/firebase/converters';
import type { DeletedRecord, Folder, RollItem } from '@/lib/models';
import { err, ok, type Result } from './result';

function isNonEmpty(s: unknown): s is string {
  return typeof s === 'string' && s.trim() !== '';
}

function resolveDb(): { ok: true; db: Firestore } | { ok: false; result: Result<never> } {
  try {
    const db = getDb();
    if (!db) return { ok: false, result: err('firestore/no-db', 'Firebase is not configured.') };
    return { ok: true, db };
  } catch (e: unknown) {
    return { ok: false, result: err('firestore/init-failed', e instanceof Error ? e.message : String(e)) };
  }
}

/**
 * Atomically soft-delete an item: update /items/{itemId} with deleted metadata
 * AND create /deletedRecords/{itemId} tombstone in the same transaction.
 * Rules use `getAfter()` to verify the tombstone was created in this commit.
 *
 * Errors: `invalid-input`, `firestore/no-db`, `firestore/init-failed`,
 * `item-missing`, `firestore/<FirestoreErrorCode>`, `firestore/transaction-failed`.
 */
export async function softDeleteItem(
  itemId: string,
  reason: string,
  actorUid: string,
): Promise<Result<void>> {
  if (!isNonEmpty(itemId)) return err('invalid-input', 'itemId is required.');
  if (!isNonEmpty(actorUid)) return err('invalid-input', 'actorUid is required.');

  const dbR = resolveDb();
  if (!dbR.ok) return dbR.result;
  const { db } = dbR;

  const itemRef = doc(db, 'items', itemId).withConverter(itemConverter);
  const recordRef = doc(db, 'deletedRecords', itemId).withConverter(deletedRecordConverter);

  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(itemRef);
      if (!snap.exists()) throw new Error('item-missing');
      const liveItem = snap.data();
      if (liveItem.deletedAt !== null) throw new Error('item-missing');

      const expireAt = Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000 + 5 * 60 * 1000);

      const {
        deletedAt: _da,
        deletedBy: _db,
        deleteReason: _dr,
        ...snapshotFields
      } = liveItem;

      const tombstone: Omit<DeletedRecord, 'itemId'> = {
        snapshot: snapshotFields as Omit<RollItem, 'deletedAt' | 'deletedBy' | 'deleteReason'>,
        deletedAt: serverTimestamp(),
        deletedBy: actorUid,
        deleteReason: reason.trim() || null,
        expireAt,
        folderIdAtDelete: liveItem.folderId,
        folderAncestorsAtDelete: liveItem.folderAncestors,
      };

      tx.update(itemRef, {
        deletedAt: serverTimestamp(),
        deletedBy: actorUid,
        deleteReason: reason.trim() || null,
        updatedAt: serverTimestamp(),
        updatedBy: actorUid,
      });
      tx.set(recordRef, tombstone);
    });
    return ok(undefined);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (message === 'item-missing') return err('item-missing', 'The item is missing or has already been deleted.');
    if (e instanceof FirebaseError) return err(`firestore/${e.code}`, e.message);
    return err('firestore/transaction-failed', message);
  }
}

/**
 * Soft-delete a folder in-place. No tombstone is created — folders don't have
 * a /deletedRecords collection. Rules enforce `deletedAt == request.time`.
 *
 * Errors: `invalid-input`, `firestore/no-db`, `firestore/init-failed`,
 * `folder-missing`, `firestore/<FirestoreErrorCode>`, `firestore/transaction-failed`.
 */
export async function softDeleteFolder(
  folderId: string,
  _reason: string,
  actorUid: string,
): Promise<Result<void>> {
  if (!isNonEmpty(folderId)) return err('invalid-input', 'folderId is required.');
  if (!isNonEmpty(actorUid)) return err('invalid-input', 'actorUid is required.');

  const dbR = resolveDb();
  if (!dbR.ok) return dbR.result;
  const { db } = dbR;

  const folderRef = doc(db, 'folders', folderId).withConverter(folderConverter);

  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(folderRef);
      if (!snap.exists()) throw new Error('folder-missing');
      const liveFolder = snap.data();
      if (liveFolder.deletedAt !== null) throw new Error('folder-missing');

      tx.update(folderRef, {
        deletedAt: serverTimestamp(),
        deletedBy: actorUid,
        deleteReason: _reason.trim() || null,
        updatedAt: serverTimestamp(),
        updatedBy: actorUid,
      });
    });
    return ok(undefined);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (message === 'folder-missing') return err('folder-missing', 'The folder is missing or has already been deleted.');
    if (e instanceof FirebaseError) return err(`firestore/${e.code}`, e.message);
    return err('firestore/transaction-failed', message);
  }
}

/**
 * Returns whether a folder's subtree is empty (no active items and no active
 * child folders). Used by the folder-delete UI to gate the action.
 * Errors: `invalid-input`, `firestore/no-db`, `firestore/init-failed`,
 * `firestore/<FirestoreErrorCode>`, `firestore/unknown`.
 */
export async function getFolderSubtreeIsEmpty(
  folderId: string,
): Promise<Result<{ empty: boolean; itemCount: number; folderCount: number }>> {
  if (!isNonEmpty(folderId)) return err('invalid-input', 'folderId is required.');

  const dbR = resolveDb();
  if (!dbR.ok) return dbR.result;
  const { db } = dbR;

  try {
    const itemQ = query(
      collection(db, 'items').withConverter(itemConverter),
      where('folderAncestors', 'array-contains', folderId),
      where('deletedAt', '==', null),
    );
    const folderQ = query(
      collection(db, 'folders').withConverter(folderConverter),
      where('parentId', '==', folderId),
      where('deletedAt', '==', null),
    );

    const [itemSnap, folderSnap] = await Promise.all([
      getCountFromServer(itemQ),
      getCountFromServer(folderQ),
    ]);

    const itemCount = itemSnap.data().count;
    const folderCount = folderSnap.data().count;
    return ok({ empty: itemCount === 0 && folderCount === 0, itemCount, folderCount });
  } catch (e: unknown) {
    if (e instanceof FirebaseError) return err(`firestore/${e.code}`, e.message);
    return err('firestore/unknown', e instanceof Error ? e.message : String(e));
  }
}

/**
 * Live subscription to soft-deleted items, newest first.
 * Returns an SDK `Unsubscribe`; caller MUST invoke on cleanup.
 */
export function subscribeToDeletedItems(
  onNext: (items: RollItem[]) => void,
  onError: (error: { code: string; message: string }) => void,
): Unsubscribe {
  let db: Firestore;
  try {
    const maybeDb = getDb();
    if (!maybeDb) {
      queueMicrotask(() => onError({ code: 'firestore/no-db', message: 'Firebase is not configured.' }));
      return () => undefined;
    }
    db = maybeDb;
  } catch (e: unknown) {
    queueMicrotask(() => onError({
      code: 'firestore/init-failed',
      message: e instanceof Error ? e.message : String(e),
    }));
    return () => undefined;
  }

  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  const cutoff = Timestamp.fromMillis(Date.now() - THIRTY_DAYS_MS);
  const q = query(
    collection(db, 'items').withConverter(itemConverter),
    where('deletedAt', '>=', cutoff),
    orderBy('deletedAt', 'desc'),
  );
  return onSnapshot(q, {
    next: (snap) => onNext(snap.docs.map((d) => d.data())),
    error: (e) => onError({ code: `firestore/${e.code}`, message: e.message }),
  });
}

/**
 * Live subscription to soft-deleted folders, newest first.
 * Returns an SDK `Unsubscribe`; caller MUST invoke on cleanup.
 */
export function subscribeToDeletedFolders(
  onNext: (folders: Folder[]) => void,
  onError: (error: { code: string; message: string }) => void,
): Unsubscribe {
  let db: Firestore;
  try {
    const maybeDb = getDb();
    if (!maybeDb) {
      queueMicrotask(() => onError({ code: 'firestore/no-db', message: 'Firebase is not configured.' }));
      return () => undefined;
    }
    db = maybeDb;
  } catch (e: unknown) {
    queueMicrotask(() => onError({
      code: 'firestore/init-failed',
      message: e instanceof Error ? e.message : String(e),
    }));
    return () => undefined;
  }

  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  const cutoff = Timestamp.fromMillis(Date.now() - THIRTY_DAYS_MS);
  const q = query(
    collection(db, 'folders').withConverter(folderConverter),
    where('deletedAt', '>=', cutoff),
    orderBy('deletedAt', 'desc'),
  );
  return onSnapshot(q, {
    next: (snap) => onNext(snap.docs.map((d) => d.data())),
    error: (e) => onError({ code: `firestore/${e.code}`, message: e.message }),
  });
}
