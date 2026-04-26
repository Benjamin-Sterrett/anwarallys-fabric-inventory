// Folder reads. `deletedAt == null` skips tombstones.

import { FirebaseError } from 'firebase/app';
import {
  collection,
  getCountFromServer,
  getDocs,
  query,
  where,
  type Firestore,
} from 'firebase/firestore';
import { getDb } from '@/lib/firebase/app';
import { folderConverter, itemConverter } from '@/lib/firebase/converters';
import type { Folder } from '@/lib/models';
import { err, ok, type Result } from './result';

// Two-try pattern: init failures (`getDb()` throwing — IndexedDB disabled,
// storage quota) map to `firestore/init-failed`; operational failures
// (`permission-denied`, `failed-precondition`, `unavailable`, etc.) preserve
// the SDK's `FirebaseError.code` so callers can distinguish authz problems
// from genuine init failures.

/**
 * Immediate children of a folder. Pass `null` for root-level (Rooms).
 * Errors: `firestore/no-db`, `firestore/init-failed`,
 * `firestore/<FirestoreErrorCode>` (e.g. `firestore/permission-denied`,
 * `firestore/unavailable`), `firestore/unknown`.
 */
export async function listFolderChildren(parentId: string | null): Promise<Result<Folder[]>> {
  let db: Firestore;
  try {
    const maybeDb = getDb();
    if (!maybeDb) return err('firestore/no-db', 'Firebase is not configured.');
    db = maybeDb;
  } catch (e: unknown) {
    return err('firestore/init-failed', e instanceof Error ? e.message : String(e));
  }

  try {
    const q = query(
      collection(db, 'folders').withConverter(folderConverter),
      where('parentId', '==', parentId),
      where('deletedAt', '==', null),
    );
    const snap = await getDocs(q);
    return ok(snap.docs.map((d) => d.data()));
  } catch (e: unknown) {
    if (e instanceof FirebaseError) return err(`firestore/${e.code}`, e.message);
    return err('firestore/unknown', e instanceof Error ? e.message : String(e));
  }
}

/**
 * Active items in `folderId`'s subtree (via denormalized `folderAncestors`).
 * Errors: `firestore/no-db`, `firestore/init-failed`,
 * `firestore/<FirestoreErrorCode>`, `firestore/unknown`.
 */
export async function countActiveItemsInSubtree(folderId: string): Promise<Result<number>> {
  let db: Firestore;
  try {
    const maybeDb = getDb();
    if (!maybeDb) return err('firestore/no-db', 'Firebase is not configured.');
    db = maybeDb;
  } catch (e: unknown) {
    return err('firestore/init-failed', e instanceof Error ? e.message : String(e));
  }

  try {
    const q = query(
      collection(db, 'items').withConverter(itemConverter),
      where('folderAncestors', 'array-contains', folderId),
      where('deletedAt', '==', null),
    );
    const snap = await getCountFromServer(q);
    return ok(snap.data().count);
  } catch (e: unknown) {
    if (e instanceof FirebaseError) return err(`firestore/${e.code}`, e.message);
    return err('firestore/unknown', e instanceof Error ? e.message : String(e));
  }
}
