// Movements — safety-critical. `createMovementAndAdjustItem` is the ONLY
// path that writes `RollItem.remainingMeters`. Don't add setters.
//
// Optimistic concurrency: caller passes `expectedOldMeters` (the value the
// user saw). Mismatch in-tx => `meters-mismatch`. No `increment()` — it
// would apply a delta on top of whatever's at commit time, so "set to
// 90m" could silently produce 80m on a concurrent edit.

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
const INVALID_METERS = 'invalid-meters';

function isValidMeters(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0;
}

/**
 * Atomically validate, write `Movement`, and update
 * `RollItem.remainingMeters` in one Firestore transaction. Fractional
 * meters are valid (12.5m is a normal cut).
 *
 * Errors: `firestore/no-db`, `invalid-meters` (params or live doc corrupt
 * — `NaN` would permanently break `!== expectedOldMeters` and brick the
 * roll), `item-missing`, `meters-mismatch`, `firestore/transaction-failed`.
 */
export async function createMovementAndAdjustItem(
  params: AdjustStockParams,
): Promise<Result<{ movementId: string; newMeters: number }>> {
  if (!isValidMeters(params.newMeters)) return err('invalid-meters', 'newMeters must be a finite, non-negative number.');
  if (!isValidMeters(params.expectedOldMeters)) return err('invalid-meters', 'expectedOldMeters must be a finite, non-negative number.');

  const db = getDb();
  if (!db) return err('firestore/no-db', 'Firebase is not configured.');

  const itemRef = doc(db, 'items', params.itemId).withConverter(itemConverter);
  const movementRef = doc(collection(db, 'movements')).withConverter(movementConverter);

  try {
    const result = await runTransaction(db, async (tx) => {
      const snap = await tx.get(itemRef);
      if (!snap.exists()) throw new Error(ITEM_MISSING);
      const liveItem = snap.data();
      if (liveItem.deletedAt !== null) throw new Error(ITEM_MISSING);
      // Live-doc corruption recovery — NaN would brick the roll.
      if (!isValidMeters(liveItem.remainingMeters)) throw new Error(INVALID_METERS);
      if (liveItem.remainingMeters !== params.expectedOldMeters) throw new Error(METERS_MISMATCH);

      const deltaMeters = params.newMeters - liveItem.remainingMeters;

      // Denormalize folder context — audit trail survives item moves.
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

      tx.update(itemRef, { remainingMeters: params.newMeters, updatedAt: serverTimestamp(), updatedBy: params.actorUid });
      tx.set(movementRef, movementPayload);

      return { movementId: movementRef.id, newMeters: params.newMeters };
    });
    return ok(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (message === ITEM_MISSING) return err('item-missing', 'The item is missing or has been deleted.');
    if (message === METERS_MISMATCH) return err('meters-mismatch', 'Stock changed in another session. Refresh and try again.');
    if (message === INVALID_METERS) return err('invalid-meters', 'Live remainingMeters is not a finite, non-negative number.');
    return err('firestore/transaction-failed', message);
  }
}

export interface MovementsPage {
  items: Movement[];
  /** Authoritative — true iff more results exist beyond this page. */
  hasMore: boolean;
  /** Last doc on this page, for the future `startAfter` param. `null` when no next page. */
  lastCursor: QueryDocumentSnapshot<Movement> | null;
}

/**
 * Movement history, newest first. Caller MUST pass `pageSize` (no
 * default — audit-trail invariant: never silently truncate). `hasMore`
 * is authoritative: we fetch `pageSize + 1` and trim. Single-page only
 * for now; PRJ-789 adds `startAfter` consuming `lastCursor`.
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
      queryLimit(pageSize + 1), // +1 probes for "more"
    );
    const docs = (await getDocs(q)).docs;
    const hasMore = docs.length > pageSize;
    const pageDocs = hasMore ? docs.slice(0, pageSize) : docs;
    const lastCursor: QueryDocumentSnapshot<Movement> | null =
      hasMore ? (pageDocs[pageDocs.length - 1] ?? null) : null;
    return ok({ items: pageDocs.map((d) => d.data()), hasMore, lastCursor });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown Firestore error.';
    return err('firestore/list-movements-failed', message);
  }
}
