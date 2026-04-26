// Roll-item reads. `null` data means the doc is missing — legitimate for
// QR-scan landings (PRJ-794) where URLs can outlive items.

import { doc, getDoc } from 'firebase/firestore';
import { getDb } from '@/lib/firebase/app';
import { itemConverter } from '@/lib/firebase/converters';
import type { RollItem } from '@/lib/models';
import { err, ok, type Result } from './result';

/**
 * Single item by ID. `Result<null>` (not an error) when missing — callers
 * render "no longer available". Does NOT filter on `deletedAt`; the
 * recently-deleted view (PRJ-796) needs to see tombstones.
 */
export async function getItemById(itemId: string): Promise<Result<RollItem | null>> {
  const db = getDb();
  if (!db) return err('firestore/no-db', 'Firebase is not configured.');
  try {
    const ref = doc(db, 'items', itemId).withConverter(itemConverter);
    const snap = await getDoc(ref);
    if (!snap.exists()) return ok(null);
    return ok(snap.data());
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown Firestore error.';
    return err('firestore/get-item-failed', message);
  }
}
