// Roll-item reads. `null` data = missing or (default) soft-deleted.
// `includeDeleted: true` is for trash-bin / restore (PRJ-797) only.

import { FirebaseError } from 'firebase/app';
import { doc, getDoc, type Firestore } from 'firebase/firestore';
import { getDb } from '@/lib/firebase/app';
import { itemConverter } from '@/lib/firebase/converters';
import type { RollItem } from '@/lib/models';
import { err, ok, type Result } from './result';

export interface GetItemByIdOptions {
  /** Default false. Pass `true` only from trash-bin / restore (PRJ-797). */
  includeDeleted?: boolean;
}

/**
 * Single item by ID. `Result<null>` when missing or soft-deleted (default).
 * Errors: `firestore/no-db`, `firestore/init-failed`,
 * `firestore/<FirestoreErrorCode>` (e.g. `firestore/permission-denied`),
 * `firestore/unknown`.
 */
export async function getItemById(
  itemId: string,
  options: GetItemByIdOptions = {},
): Promise<Result<RollItem | null>> {
  let db: Firestore;
  try {
    const maybeDb = getDb();
    if (!maybeDb) return err('firestore/no-db', 'Firebase is not configured.');
    db = maybeDb;
  } catch (e: unknown) {
    return err('firestore/init-failed', e instanceof Error ? e.message : String(e));
  }

  try {
    const ref = doc(db, 'items', itemId).withConverter(itemConverter);
    const snap = await getDoc(ref);
    if (!snap.exists()) return ok(null);
    const item = snap.data();
    if (!options.includeDeleted && item.deletedAt !== null) return ok(null);
    return ok(item);
  } catch (e: unknown) {
    if (e instanceof FirebaseError) return err(`firestore/${e.code}`, e.message);
    return err('firestore/unknown', e instanceof Error ? e.message : String(e));
  }
}
