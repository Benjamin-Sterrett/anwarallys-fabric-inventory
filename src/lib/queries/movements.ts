// Movements — safety-critical. `createMovementAndAdjustItem` is the ONLY
// path that writes `RollItem.remainingMeters`. Don't add setters.
//
// Optimistic concurrency: caller passes `expectedOldMeters` (the value the
// user saw). Mismatch in-tx => `meters-mismatch`. No `increment()` — it
// would apply a delta on top of whatever's at commit time, so "set to
// 90m" could silently produce 80m on a concurrent edit.

import { FirebaseError } from 'firebase/app';
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
  type DocumentReference,
  type Firestore,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { getDb } from '@/lib/firebase/app';
import { itemConverter, movementConverter } from '@/lib/firebase/converters';
import type { Movement, MovementReason, RollItem } from '@/lib/models';
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
  /**
   * Typed back-reference for the Undo path (PRJ-890). Set to the reversed
   * movement's id when this write is an undo; omit (or pass `null`) for
   * normal stock changes. Boundary defaults to `null` so callers that
   * don't undo stay rules-conformant.
   */
  reversesMovementId?: string | null;
  /**
   * Client-generated UUID v4 for atomic stock-write reconciliation on save
   * timeout (PRJ-883). Callers MAY pass a pre-generated id so they can
   * reconcile via `findMovementByCorrelationId(itemId, id)` after a
   * client-side timeout fires while the transaction commit is still in
   * flight. If omitted, the boundary generates a fresh UUID so writes
   * still land with the field populated — the rollout floor is "every new
   * movement has a correlation id" even if the caller doesn't reconcile.
   * The resolved id is returned in the success Result so caller-omit
   * paths can still recover state if needed.
   */
  clientCorrelationId?: string;
}

// Sentinels thrown inside the transaction; outer catch maps them.
const ITEM_MISSING = 'item-missing';
const METERS_MISMATCH = 'meters-mismatch';
const INVALID_METERS = 'invalid-meters';
const STALE_REVERSAL = 'stale-reversal';

function isValidMeters(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0;
}

function isNonEmpty(s: unknown): s is string {
  return typeof s === 'string' && s.trim() !== '';
}

/**
 * Atomically validate, write `Movement`, update `RollItem.remainingMeters`.
 * Fractional meters valid (12.5m is normal). Param validation runs BEFORE
 * I/O; `getDb()` runs inside try so init failures map to
 * `firestore/init-failed` instead of leaking past the boundary.
 *
 * Errors: `invalid-meters` (params or live doc — `NaN` would brick the
 * roll), `invalid-actor` (empty UID/name breaks audit attribution),
 * `invalid-reversal` (PRJ-890 — back-reference set but malformed/wrong
 * reason), `stale-reversal` (PRJ-890 — undo target is no longer the
 * item's last movement), `invalid-correlation-id` (PRJ-883 — caller
 * supplied an empty/whitespace string), `firestore/no-db`,
 * `firestore/init-failed`, `item-missing`,
 * `meters-mismatch`, `firestore/<FirestoreErrorCode>` (e.g.
 * `firestore/permission-denied`, `firestore/aborted` for tx contention),
 * `firestore/transaction-failed` (non-FirebaseError fallback).
 */
export async function createMovementAndAdjustItem(
  params: AdjustStockParams,
): Promise<Result<{ movementId: string; newMeters: number; clientCorrelationId: string }>> {
  if (!isValidMeters(params.newMeters)) return err('invalid-meters', 'newMeters must be a finite, non-negative number.');
  if (!isValidMeters(params.expectedOldMeters)) return err('invalid-meters', 'expectedOldMeters must be a finite, non-negative number.');
  // Zero-delta adjustments are rejected at the boundary because Security
  // Rules require lastMovementId to flip only when remainingMeters changes
  // — a no-op write would fail at the auth layer (PRJ-805).
  if (params.newMeters === params.expectedOldMeters) return err('zero-delta', 'No-op adjustment: newMeters equals expectedOldMeters.');
  // Attribution invariant — early-page-load auth race (see auth.ts) could
  // hand callers an empty string; the boundary fails fast so they can't.
  if (!isNonEmpty(params.actorUid)) return err('invalid-actor', 'actorUid is required and must be non-empty.');
  if (!isNonEmpty(params.actorName)) return err('invalid-actor', 'actorName is required and must be non-empty.');
  // PRJ-890: when this write is a reversal, the back-reference must be a
  // non-empty string and the reason must be 'correction' (mirrors rules).
  // Boundary fail-fast keeps malformed inputs from racing into a tx that
  // Rules will reject anyway, and matches the audit-trail invariant.
  if (params.reversesMovementId != null) {
    if (!isNonEmpty(params.reversesMovementId)) return err('invalid-reversal', 'reversesMovementId must be a non-empty string when set.');
    if (params.reason !== 'correction') return err('invalid-reversal', "reversesMovementId requires reason 'correction'.");
  }
  // PRJ-883: caller may pre-generate the correlation id (so they can
  // reconcile via `findMovementByCorrelationId` after a client-side
  // timeout). Boundary fail-fast on supplied-but-blank values; a blank
  // id would defeat the reconcile lookup. When omitted, the boundary
  // generates a fresh UUID — every movement leaves the boundary with
  // the field populated.
  if (params.clientCorrelationId !== undefined && !isNonEmpty(params.clientCorrelationId)) {
    return err('invalid-correlation-id', 'clientCorrelationId must be a non-empty string when set.');
  }
  const correlationId = params.clientCorrelationId ?? crypto.randomUUID();

  // Init phase: getDb() can throw (IndexedDB / storage quota).
  let db: Firestore;
  let itemRef: DocumentReference<RollItem>;
  let movementRef: DocumentReference<Movement>;
  try {
    const maybeDb = getDb();
    if (!maybeDb) return err('firestore/no-db', 'Firebase is not configured.');
    db = maybeDb;
    itemRef = doc(db, 'items', params.itemId).withConverter(itemConverter);
    movementRef = doc(collection(db, 'movements')).withConverter(movementConverter);
  } catch (e: unknown) {
    return err('firestore/init-failed', e instanceof Error ? e.message : String(e));
  }

  try {
    const result = await runTransaction(db, async (tx) => {
      const snap = await tx.get(itemRef);
      if (!snap.exists()) throw new Error(ITEM_MISSING);
      const liveItem = snap.data();
      if (liveItem.deletedAt !== null) throw new Error(ITEM_MISSING);
      // Live-doc corruption recovery — NaN would brick the roll.
      if (!isValidMeters(liveItem.remainingMeters)) throw new Error(INVALID_METERS);
      if (liveItem.remainingMeters !== params.expectedOldMeters) throw new Error(METERS_MISMATCH);
      // PRJ-890: Undo can only target the item's CURRENT last movement.
      // If another adjustment has landed since the user opened the screen,
      // the undo affordance is stale — surface that as its own error so
      // the UI can prompt for refresh rather than the more generic
      // `meters-mismatch` (which can also fire for plain stock races).
      if (params.reversesMovementId != null
          && liveItem.lastMovementId !== params.reversesMovementId) {
        throw new Error(STALE_REVERSAL);
      }

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
        reversesMovementId: params.reversesMovementId ?? null,
        clientCorrelationId: correlationId,
      };

      // `lastMovementId` is the rules-verifiable cross-reference: PRJ-805
      // Security Rules use `getAfter(/movements/$(lastMovementId))` on the
      // items update to require any `remainingMeters` change to be paired
      // with a real audit entry written in this same commit.
      tx.update(itemRef, {
        remainingMeters: params.newMeters,
        lastMovementId: movementRef.id,
        updatedAt: serverTimestamp(),
        updatedBy: params.actorUid,
      });
      tx.set(movementRef, movementPayload);

      return { movementId: movementRef.id, newMeters: params.newMeters, clientCorrelationId: correlationId };
    });
    return ok(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // Inner-tx sentinels are wrapped in `Error`, so check `.message`
    // BEFORE the FirebaseError instanceof check — they aren't FirebaseErrors.
    if (message === ITEM_MISSING) return err('item-missing', 'The item is missing or has been deleted.');
    if (message === METERS_MISMATCH) return err('meters-mismatch', 'Stock changed in another session. Refresh and try again.');
    if (message === INVALID_METERS) return err('invalid-meters', 'Live remainingMeters is not a finite, non-negative number.');
    if (message === STALE_REVERSAL) return err('stale-reversal', 'Another adjustment ran after this one. Refresh and try again.');
    // Preserve the SDK error code (permission-denied from Security Rules,
    // failed-precondition from missing index, unavailable when offline,
    // aborted from tx contention, etc.) so callers can react accurately.
    if (e instanceof FirebaseError) return err(`firestore/${e.code}`, e.message);
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
 * Movement history, newest first. `pageSize` MUST be a positive integer
 * (audit-trail invariant: never silently truncate or no-op). `hasMore` is
 * authoritative — fetch `pageSize + 1` and trim. PRJ-789 adds `startAfter`.
 * Errors: `invalid-page-size`, `firestore/no-db`, `firestore/init-failed`,
 * `firestore/<FirestoreErrorCode>` (e.g. `firestore/permission-denied`,
 * `firestore/failed-precondition` for missing composite index),
 * `firestore/unknown`.
 */
export async function listMovementsForItem(
  itemId: string,
  pageSize: number,
): Promise<Result<MovementsPage>> {
  if (!Number.isInteger(pageSize) || pageSize <= 0) return err('invalid-page-size', 'pageSize must be a positive integer.');

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
  } catch (e: unknown) {
    if (e instanceof FirebaseError) return err(`firestore/${e.code}`, e.message);
    return err('firestore/unknown', e instanceof Error ? e.message : String(e));
  }
}

/**
 * Reconciliation lookup for the timeout path (PRJ-883). Given the
 * caller's pre-generated `clientCorrelationId`, returns the matching
 * Movement (if it committed) or `null` (if no doc exists yet).
 *
 * Doubly-scoped by `itemId` for ownership safety: even though
 * `clientCorrelationId` is user-supplied, the rules enforce
 * `actorUid == auth.uid` on movement create, so a found doc could only
 * have been written by the current user. The `itemId` filter narrows
 * the lookup to the save attempt's intended target — a stray collision
 * (already vanishingly unlikely with v4 UUIDs) on a different item is
 * impossible to mistake for "this save".
 *
 * Caller MUST treat a network/index error as inconclusive and fall back
 * to "verify on-hand before retrying" — never auto-success on a query
 * failure. Intended call sequence: timeout fires → poll this function
 * once → wait grace period → poll once more → if still null, treat as
 * confirmed not committed.
 *
 * Errors: `invalid-correlation-id`, `firestore/no-db`,
 * `firestore/init-failed`, `firestore/<FirestoreErrorCode>` (e.g.
 * `firestore/permission-denied`, `firestore/failed-precondition` for
 * missing composite index), `firestore/unknown`.
 */
export async function findMovementByCorrelationId(
  itemId: string,
  clientCorrelationId: string,
): Promise<Result<Movement | null>> {
  if (!isNonEmpty(itemId)) return err('invalid-correlation-id', 'itemId must be a non-empty string.');
  if (!isNonEmpty(clientCorrelationId)) return err('invalid-correlation-id', 'clientCorrelationId must be a non-empty string.');

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
      collection(db, 'movements').withConverter(movementConverter),
      where('clientCorrelationId', '==', clientCorrelationId),
      where('itemId', '==', itemId),
      queryLimit(1),
    );
    const docs = (await getDocs(q)).docs;
    return ok(docs.length === 0 ? null : (docs[0]?.data() ?? null));
  } catch (e: unknown) {
    if (e instanceof FirebaseError) return err(`firestore/${e.code}`, e.message);
    return err('firestore/unknown', e instanceof Error ? e.message : String(e));
  }
}
