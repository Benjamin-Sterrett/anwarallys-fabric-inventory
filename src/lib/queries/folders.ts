// Folder reads. Both queries filter `deletedAt == null` to skip tombstones
// and pair with indexes in `firestore.indexes.json`.

import {
  collection,
  getCountFromServer,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { getDb } from '@/lib/firebase/app';
import { folderConverter, itemConverter } from '@/lib/firebase/converters';
import type { Folder } from '@/lib/models';
import { err, ok, type Result } from './result';

/** Immediate children of a folder. Pass `null` for root-level (Rooms). */
export async function listFolderChildren(parentId: string | null): Promise<Result<Folder[]>> {
  const db = getDb();
  if (!db) return err('firestore/no-db', 'Firebase is not configured.');
  try {
    const q = query(
      collection(db, 'folders').withConverter(folderConverter),
      where('parentId', '==', parentId),
      where('deletedAt', '==', null),
    );
    const snap = await getDocs(q);
    return ok(snap.docs.map((d) => d.data()));
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown Firestore error.';
    return err('firestore/list-folder-children-failed', message);
  }
}

/**
 * Active items in `folderId`'s subtree. `array-contains` against the
 * denormalized `folderAncestors[]` field on `RollItem`.
 */
export async function countActiveItemsInSubtree(folderId: string): Promise<Result<number>> {
  const db = getDb();
  if (!db) return err('firestore/no-db', 'Firebase is not configured.');
  try {
    const q = query(
      collection(db, 'items').withConverter(itemConverter),
      where('folderAncestors', 'array-contains', folderId),
      where('deletedAt', '==', null),
    );
    const snap = await getCountFromServer(q);
    return ok(snap.data().count);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown Firestore error.';
    return err('firestore/count-items-failed', message);
  }
}
