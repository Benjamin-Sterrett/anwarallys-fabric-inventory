// Movements layer — the most safety-critical surface in the app.
// `createMovementAndAdjustItem` is the ONLY supported way to mutate
// `RollItem.remainingMeters`. Don't add convenience setters.
//
// Concurrency is optimistic via caller-supplied `expectedOldMeters`. Inside
// the transaction we `tx.get` the live doc and compare `remainingMeters` to
// `expectedOldMeters`; mismatch => abort with `meters-mismatch` so the
// second writer fails fast and UI shows "stock changed, refresh" (PRJ-787).
//
// No `increment()`: it would apply a delta on top of whatever's at commit
// time — wrong behavior. "Set to 90m" must not silently produce 80m when a
// concurrent edit already moved the value to 90m.

import {
  collection,
  doc,
  getDocs,
  limit as queryLimit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import { getDb } from '@/lib/firebase/app';
import { itemConverter, movementConverter } from '@/lib/firebase/converters';
import type { Movement, MovementReason } from '@/lib/models';
import { err, ok, type Result } from './result';

/**
 * Inputs for a stock adjustment. `expectedOldMeters` is the
 * optimistic-concurrency guard — pass the value the user saw in the UI.
 * Don't paper over a mismatch by re-reading just before the transaction;
 * that defeats the guard.
 */
export interface AdjustStockParams {
  itemId: string;
  expectedOldMeters: number;
  newMeters: number;
  reason: MovementReason;
  note: string | null;
  actorUid: string;
  actorName: string;
}

// Sentinels thrown inside the transaction; outer catch maps them.
const ITEM_MISSING = 'item-missing';
const METERS_MISMATCH = 'meters-mismatch';

/**
 * Atomically validate the live item, write the `Movement` audit record,
 * and update `RollItem.remainingMeters` — all in one Firestore transaction.
 *
 * Errors: `item-missing` (gone/soft-deleted), `meters-mismatch` (concurrent
 * edit), `firestore/transaction-failed` (everything else).
 */
export async function createMovementAndAdjustItem(
  params: AdjustStockParams,
): Promise<Result<{ movementId: string; newMeters: number }>> {
  const db = getDb();
  if (!db) return err('firestore/no-db', 'Firebase is not configured.');

  const itemRef = doc(db, 'items', params.itemId).withConverter(itemConverter);
  // Allocate the movement doc-ID locally so the transaction can reference
  // it without round-tripping. Documented pattern for transactional creates.
  const movementRef = doc(collection(db, 'movements')).withConverter(
    movementConverter,
  );

  try {
    const result = await runTransaction(db, async (tx) => {
      const snap = await tx.get(itemRef);
      if (!snap.exists()) throw new Error(ITEM_MISSING);
      const liveItem = snap.data();
      if (liveItem.deletedAt !== null) throw new Error(ITEM_MISSING);
      if (liveItem.remainingMeters !== params.expectedOldMeters) {
        throw new Error(METERS_MISMATCH);
      }

      const deltaMeters = params.newMeters - liveItem.remainingMeters;

      // Denormalize folder context from the live item — audit trail must
      // survive later item moves (PRJ-789 history view depends on this).
      const movementPayload = {
        movementId: movementRef.id,
        itemId: params.itemId,
        folderIdAtTime: liveItem.folderId,
        folderAncestorsAtTime: liveItem.folderAncestors,
        oldMeters: liveItem.remainingMeters,
        newMeters: params.newMeters,
        deltaMeters,
        reason: params.reason,
        note: params.note,
        actorUid: params.actorUid,
        actorName: params.actorName,
        at: serverTimestamp(),
      };

      // Item first, movement second — Firestore commits both atomically.
      tx.update(itemRef, {
        remainingMeters: params.newMeters,
        updatedAt: serverTimestamp(),
        updatedBy: params.actorUid,
      });
      tx.set(movementRef, movementPayload);

      return { movementId: movementRef.id, newMeters: params.newMeters };
    });
    return ok(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (message === ITEM_MISSING) {
      return err('item-missing', 'The item is missing or has been deleted.');
    }
    if (message === METERS_MISMATCH) {
      return err(
        'meters-mismatch',
        'Stock changed in another session. Refresh and try again.',
      );
    }
    return err('firestore/transaction-failed', message);
  }
}

/** Movement history for one item, newest first. Default limit 50. */
export async function listMovementsForItem(
  itemId: string,
  limit: number = 50,
): Promise<Result<Movement[]>> {
  const db = getDb();
  if (!db) return err('firestore/no-db', 'Firebase is not configured.');
  try {
    const q = query(
      collection(db, 'movements').withConverter(movementConverter),
      where('itemId', '==', itemId),
      orderBy('at', 'desc'),
      queryLimit(limit),
    );
    const snap = await getDocs(q);
    return ok(snap.docs.map((d) => d.data()));
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown Firestore error.';
    return err('firestore/list-movements-failed', message);
  }
}
