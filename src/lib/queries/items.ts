// Roll-item reads. `null` data = missing or (default) soft-deleted.
// `includeDeleted: true` is for trash-bin / restore (PRJ-797) only.

import { doc, getDoc } from 'firebase/firestore';
import { getDb } from '@/lib/firebase/app';
import { itemConverter } from '@/lib/firebase/converters';
import type { RollItem } from '@/lib/models';
import { err, ok, type Result } from './result';

export interface GetItemByIdOptions {
  /** Default false. Pass `true` only from trash-bin / restore (PRJ-797). */
  includeDeleted?: boolean;
}

/** Single item by ID. `Result<null>` when missing or soft-deleted (default). */
export async function getItemById(
  itemId: string,
  options: GetItemByIdOptions = {},
): Promise<Result<RollItem | null>> {
  const db = getDb();
  if (!db) return err('firestore/no-db', 'Firebase is not configured.');
  try {
    const ref = doc(db, 'items', itemId).withConverter(itemConverter);
    const snap = await getDoc(ref);
    if (!snap.exists()) return ok(null);
    const item = snap.data();
    if (!options.includeDeleted && item.deletedAt !== null) return ok(null);
    return ok(item);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown Firestore error.';
    return err('firestore/get-item-failed', message);
  }
}
