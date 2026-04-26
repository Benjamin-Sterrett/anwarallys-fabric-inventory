// Folder reads. `deletedAt == null` skips tombstones.

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

// `getDb()` can THROW (IndexedDB disabled, storage quota) — must run inside
// the try so init failures map to a typed `Result.err` instead of a thrown
// exception leaking past the boundary.

/** Immediate children of a folder. Pass `null` for root-level (Rooms). */
export async function listFolderChildren(parentId: string | null): Promise<Result<Folder[]>> {
  try {
    const db = getDb();
    if (!db) return err('firestore/no-db', 'Firebase is not configured.');
    const q = query(
      collection(db, 'folders').withConverter(folderConverter),
      where('parentId', '==', parentId),
      where('deletedAt', '==', null),
    );
    const snap = await getDocs(q);
    return ok(snap.docs.map((d) => d.data()));
  } catch (e: unknown) {
    return err('firestore/init-failed', e instanceof Error ? e.message : String(e));
  }
}

/** Active items in `folderId`'s subtree (via denormalized `folderAncestors`). */
export async function countActiveItemsInSubtree(folderId: string): Promise<Result<number>> {
  try {
    const db = getDb();
    if (!db) return err('firestore/no-db', 'Firebase is not configured.');
    const q = query(
      collection(db, 'items').withConverter(itemConverter),
      where('folderAncestors', 'array-contains', folderId),
      where('deletedAt', '==', null),
    );
    const snap = await getCountFromServer(q);
    return ok(snap.data().count);
  } catch (e: unknown) {
    return err('firestore/init-failed', e instanceof Error ? e.message : String(e));
  }
}
