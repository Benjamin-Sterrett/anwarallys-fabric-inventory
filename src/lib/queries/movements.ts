// Movements — safety-critical. `createMovementAndAdjustItem` is the ONLY
// path that writes `RollItem.remainingMeters`. Don't add convenience
// setters.
//
// Optimistic concurrency: caller passes `expectedOldMeters` (the value
// the user saw). `tx.get` then compare to the live doc; mismatch =>
// `meters-mismatch`. No `increment()` — it would apply a delta on top of
// whatever's at commit time, so "set to 90m" could silently produce 80m
// when a concurrent edit already moved the value to 90m.

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
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { getDb } from '@/lib/firebase/app';
import { itemConverter, movementConverter } from '@/lib/firebase/converters';
import type { Movement, MovementReason } from '@/lib/models';
import { err, ok, type Result } from './result';

/** `expectedOldMeters` is the concurrency guard — never re-read it. */
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
  // Auto-ID allocated locally so the transaction can reference it.
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

      // Denormalize folder context — audit trail survives later item moves.
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
    if (message === ITEM_MISSING) return err('item-missing', 'The item is missing or has been deleted.');
    if (message === METERS_MISMATCH) return err('meters-mismatch', 'Stock changed in another session. Refresh and try again.');
    return err('firestore/transaction-failed', message);
  }
}

export interface MovementsPage {
  items: Movement[];
  /** True when `items.length === pageSize`; caller should fetch the next page. */
  hasMore: boolean;
  /** Pass to a future `startAfter` param to fetch the next page. */
  lastCursor: QueryDocumentSnapshot<Movement> | null;
}

/**
 * Movement history, newest first. Caller MUST pass `pageSize` — no
 * default. Audit-trail invariant: never silently drop older movements.
 * Single-page only for now; PRJ-789 adds a `startAfter` param that
 * consumes `lastCursor`. `hasMore === true` means more results exist.
 */
export async function listMovementsForItem(
  itemId: string,
  pageSize: number,
): Promise<Result<MovementsPage>> {
  const db = getDb();
  if (!db) return err('firestore/no-db', 'Firebase is not configured.');
  try {
    const q = query(
      collection(db, 'movements').withConverter(movementConverter),
      where('itemId', '==', itemId),
      orderBy('at', 'desc'),
      queryLimit(pageSize),
    );
    const snap = await getDocs(q);
    const items = snap.docs.map((d) => d.data());
    const lastDoc = snap.docs[snap.docs.length - 1] ?? null;
    return ok({
      items,
      hasMore: snap.docs.length === pageSize,
      lastCursor: lastDoc,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown Firestore error.';
    return err('firestore/list-movements-failed', message);
  }
}
