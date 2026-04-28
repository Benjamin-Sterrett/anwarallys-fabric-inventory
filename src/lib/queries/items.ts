// Roll-item reads + create/edit (non-stock) writes. Stock writes live in
// movements.ts. updateItem MUST NOT touch remainingMeters/lastMovementId/
// initialMeters/folderId/folderAncestors/deletedAt|By|Reason — those are
// owned by stock-adjust (PRJ-787), folder-move (future), soft-delete
// (PRJ-796). PRJ-855 pattern: split init catch from op catch.

import { FirebaseError } from 'firebase/app';
import {
  addDoc, collection, doc, getDoc, getDocFromServer, getDocs, getDocsFromServer, onSnapshot, orderBy, query,
  serverTimestamp, updateDoc, where, type Firestore, type Unsubscribe,
} from 'firebase/firestore';
import { getDb } from '@/lib/firebase/app';
import { deletedRecordConverter, itemConverter } from '@/lib/firebase/converters';
import type { DeletedRecord, RollItem } from '@/lib/models';
import { err, ok, type Result } from './result';

const isNonEmpty = (s: unknown): s is string => typeof s === 'string' && s.trim() !== '';
const isFiniteNonNeg = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;
const isFinitePos = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;
const isStringOrNull = (v: unknown): v is string | null => v === null || typeof v === 'string';
const isNumOrNull = (v: unknown): v is number | null => v === null || isFiniteNonNeg(v);

/** Resolve the Firestore handle. Same init-vs-op error split as movements.ts. */
function resolveDb(): { ok: true; db: Firestore } | { ok: false; result: Result<never> } {
  try {
    const db = getDb();
    if (!db) return { ok: false, result: err('firestore/no-db', 'Firebase is not configured.') };
    return { ok: true, db };
  } catch (e: unknown) {
    return { ok: false, result: err('firestore/init-failed', e instanceof Error ? e.message : String(e)) };
  }
}

/** Validate fields shared by create + update. Returns the bad-message or null on success. */
function validateEditableFields(p: {
  description: unknown; supplier: unknown; photoUrl: unknown;
  price: unknown; minimumMeters: unknown; actorUid: string;
}): string | null {
  if (!isNonEmpty(p.actorUid)) return 'actorUid is required.';
  if (typeof p.description !== 'string') return 'description must be a string.';
  if (!isFiniteNonNeg(p.minimumMeters)) return 'minimumMeters must be finite >= 0.';
  if (!isStringOrNull(p.supplier)) return 'supplier must be string or null.';
  if (!isStringOrNull(p.photoUrl)) return 'photoUrl must be string or null.';
  if (!isNumOrNull(p.price)) return 'price must be finite >= 0 or null.';
  return null;
}

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
  const dbR = resolveDb();
  if (!dbR.ok) return dbR.result;
  const { db } = dbR;

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

/**
 * Same as `getItemById` but bypasses the persistent local cache via
 * `getDocFromServer`. Use ONLY on safety-critical post-write reconcile
 * paths (PRJ-787 timeout / meters-mismatch recovery): the cache can hold
 * pre-commit state for several seconds after a transaction lands, which
 * would let the operator double-apply an adjustment that already
 * succeeded. Caller MUST handle `firestore/unavailable` (offline / no
 * server reachable) — there is no cache fallback by design.
 * Errors: `firestore/no-db`, `firestore/init-failed`,
 * `firestore/<FirestoreErrorCode>`, `firestore/unknown`.
 */
export async function getItemByIdFromServer(
  itemId: string,
  options: GetItemByIdOptions = {},
): Promise<Result<RollItem | null>> {
  const dbR = resolveDb();
  if (!dbR.ok) return dbR.result;
  const { db } = dbR;

  try {
    const ref = doc(db, 'items', itemId).withConverter(itemConverter);
    const snap = await getDocFromServer(ref);
    if (!snap.exists()) return ok(null);
    const item = snap.data();
    if (!options.includeDeleted && item.deletedAt !== null) return ok(null);
    return ok(item);
  } catch (e: unknown) {
    if (e instanceof FirebaseError) return err(`firestore/${e.code}`, e.message);
    return err('firestore/unknown', e instanceof Error ? e.message : String(e));
  }
}

/**
 * Single deleted-record tombstone by item ID. Returns `null` if the tombstone
 * is missing (item never deleted, or TTL purged past the 7-day window).
 * Errors: `firestore/no-db`, `firestore/init-failed`,
 * `firestore/<FirestoreErrorCode>`, `firestore/unknown`.
 */
export async function getDeletedRecordById(itemId: string): Promise<Result<DeletedRecord | null>> {
  const dbR = resolveDb();
  if (!dbR.ok) return dbR.result;
  const { db } = dbR;

  try {
    const ref = doc(db, 'deletedRecords', itemId).withConverter(deletedRecordConverter);
    const snap = await getDocFromServer(ref);
    if (!snap.exists()) return ok(null);
    return ok(snap.data());
  } catch (e: unknown) {
    if (e instanceof FirebaseError) return err(`firestore/${e.code}`, e.message);
    return err('firestore/unknown', e instanceof Error ? e.message : String(e));
  }
}

/**
 * Active items directly in `folderId` (NOT subtree). Sorted by sku asc.
 * Errors: `firestore/no-db`, `firestore/init-failed`,
 * `firestore/<FirestoreErrorCode>`, `firestore/unknown`.
 */
export async function listActiveItemsInFolder(folderId: string): Promise<Result<RollItem[]>> {
  if (!isNonEmpty(folderId)) return err('invalid-input', 'folderId is required.');
  const dbR = resolveDb();
  if (!dbR.ok) return dbR.result;
  const { db } = dbR;
  try {
    const q = query(
      collection(db, 'items').withConverter(itemConverter),
      where('folderId', '==', folderId),
      where('deletedAt', '==', null),
      orderBy('sku'),
    );
    return ok((await getDocs(q)).docs.map((d) => d.data()));
  } catch (e: unknown) {
    if (e instanceof FirebaseError) return err(`firestore/${e.code}`, e.message);
    return err('firestore/unknown', e instanceof Error ? e.message : String(e));
  }
}

/**
 * All active items across every folder. Sorted by sku asc.
 * Errors: `firestore/no-db`, `firestore/init-failed`,
 * `firestore/<FirestoreErrorCode>`, `firestore/unknown`.
 */
export async function listAllActiveItems(): Promise<Result<RollItem[]>> {
  const dbR = resolveDb();
  if (!dbR.ok) return dbR.result;
  const { db } = dbR;
  try {
    const q = query(
      collection(db, 'items').withConverter(itemConverter),
      where('deletedAt', '==', null),
      orderBy('sku'),
    );
    // PRJ-905: server-first read. Persistent local cache can hold docs that
    // have been hard-deleted on the server (smoke-test residue, console
    // cleanup). getDocs would surface these ghost items in /lowstock and
    // /print-labels. Fallback to cache when offline so browse still works
    // on flaky storeroom Wi-Fi (matches pattern in item.tsx, item-detail.tsx).
    try {
      return ok((await getDocsFromServer(q)).docs.map((d) => d.data()));
    } catch (e) {
      if (e instanceof FirebaseError && e.code === 'unavailable') {
        return ok((await getDocs(q)).docs.map((d) => d.data()));
      }
      throw e;
    }
  } catch (e: unknown) {
    if (e instanceof FirebaseError) return err(`firestore/${e.code}`, e.message);
    return err('firestore/unknown', e instanceof Error ? e.message : String(e));
  }
}

/**
 * Live subscription to active items directly in `folderId`. Sorted by sku asc.
 * Returns an SDK `Unsubscribe`; caller MUST invoke on cleanup. On `getDb()`
 * failure the returned unsubscribe is a no-op and `onError` fires once on the
 * next microtask. Errors via `onError`: `firestore/no-db`,
 * `firestore/init-failed`, `firestore/<FirestoreErrorCode>`.
 */
export function subscribeToActiveItemsInFolder(
  folderId: string,
  onNext: (items: RollItem[]) => void,
  onError: (error: { code: string; message: string }) => void,
): Unsubscribe {
  if (!isNonEmpty(folderId)) {
    queueMicrotask(() => onError({ code: 'invalid-input', message: 'folderId is required.' }));
    return () => undefined;
  }

  let db: Firestore;
  try {
    const maybeDb = getDb();
    if (!maybeDb) {
      queueMicrotask(() =>
        onError({ code: 'firestore/no-db', message: 'Firebase is not configured.' }),
      );
      return () => undefined;
    }
    db = maybeDb;
  } catch (e: unknown) {
    queueMicrotask(() =>
      onError({
        code: 'firestore/init-failed',
        message: e instanceof Error ? e.message : String(e),
      }),
    );
    return () => undefined;
  }

  const q = query(
    collection(db, 'items').withConverter(itemConverter),
    where('folderId', '==', folderId),
    where('deletedAt', '==', null),
    orderBy('sku'),
  );
  // PRJ-905 pattern: ignore cache-only snapshots until the first server
  // snapshot arrives. Persistent local cache can retain docs that have
  // been hard-deleted on the server (smoke-test residue, console cleanup).
  // onSnapshot always fires with cached data first; without this guard the
  // header badge can briefly show a stale count that disagrees with /lowstock.
  let serverSeen = false;
  return onSnapshot(
    q,
    { includeMetadataChanges: true },
    (snap) => {
      if (!serverSeen && snap.metadata.fromCache) {
        return;
      }
      serverSeen = true;
      onNext(snap.docs.map((d) => d.data()));
    },
    (e) => onError({ code: `firestore/${e.code}`, message: e.message }),
  );
}

/**
 * Live subscription to ALL active items across every folder. Sorted by sku asc.
 * Returns an SDK `Unsubscribe`; caller MUST invoke on cleanup. On `getDb()`
 * failure the returned unsubscribe is a no-op and `onError` fires once on the
 * next microtask. Errors via `onError`: `firestore/no-db`,
 * `firestore/init-failed`, `firestore/<FirestoreErrorCode>`.
 */
export function subscribeToAllActiveItems(
  onNext: (items: RollItem[]) => void,
  onError: (error: { code: string; message: string }) => void,
): Unsubscribe {
  let db: Firestore;
  try {
    const maybeDb = getDb();
    if (!maybeDb) {
      queueMicrotask(() =>
        onError({ code: 'firestore/no-db', message: 'Firebase is not configured.' }),
      );
      return () => undefined;
    }
    db = maybeDb;
  } catch (e: unknown) {
    queueMicrotask(() =>
      onError({
        code: 'firestore/init-failed',
        message: e instanceof Error ? e.message : String(e),
      }),
    );
    return () => undefined;
  }

  const q = query(
    collection(db, 'items').withConverter(itemConverter),
    where('deletedAt', '==', null),
    orderBy('sku'),
  );
  return onSnapshot(q, {
    next: (snap) => onNext(snap.docs.map((d) => d.data())),
    error: (e) => onError({ code: `firestore/${e.code}`, message: e.message }),
  });
}

/** `folderAncestors` = parent.ancestors ++ [folderId] (rules re-derive). */
export interface CreateItemParams {
  folderId: string;
  folderAncestors: string[];
  sku: string;
  description: string;
  initialMeters: number;
  minimumMeters: number;
  supplier: string | null;
  price: number | null;
  photoUrl: string | null;
  actorUid: string;
}

/**
 * Create a roll item. Errors: `invalid-input`, `firestore/no-db`,
 * `firestore/init-failed`, `firestore/<FirestoreErrorCode>` (e.g.
 * `permission-denied` when folder is missing/deleted), `firestore/unknown`.
 */
export async function createItem(
  params: CreateItemParams,
): Promise<Result<{ itemId: string }>> {
  const trimmedSku = typeof params.sku === 'string' ? params.sku.trim() : '';
  if (trimmedSku === '') return err('invalid-input', 'sku is required.');
  if (!isNonEmpty(params.folderId)) return err('invalid-input', 'folderId is required.');
  if (!Array.isArray(params.folderAncestors) || params.folderAncestors.length === 0) {
    return err('invalid-input', 'folderAncestors must be a non-empty array.');
  }
  // Sanity: rules re-validate the full chain against the live folder.
  if (params.folderAncestors[params.folderAncestors.length - 1] !== params.folderId) {
    return err('invalid-input', 'folderAncestors must end with folderId.');
  }
  if (!isFinitePos(params.initialMeters)) return err('invalid-input', 'initialMeters must be finite > 0.');
  const sharedErr = validateEditableFields(params);
  if (sharedErr) return err('invalid-input', sharedErr);

  const dbR = resolveDb();
  if (!dbR.ok) return dbR.result;
  const { db } = dbR;

  // Rules invariants: remainingMeters == initialMeters, lastMovementId == null.
  // PRJ-865: explicit null on soft-delete fields (rules' hasAll guard).
  try {
    const ref = await addDoc(
      collection(db, 'items').withConverter(itemConverter),
      {
        itemId: '', // stripped by converter
        sku: trimmedSku,
        description: params.description,
        folderId: params.folderId,
        folderAncestors: params.folderAncestors,
        remainingMeters: params.initialMeters,
        lastMovementId: null,
        initialMeters: params.initialMeters,
        minimumMeters: params.minimumMeters,
        photoUrl: params.photoUrl,
        supplier: params.supplier,
        price: params.price,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: params.actorUid,
        updatedBy: params.actorUid,
        deletedAt: null,
        deletedBy: null,
        deleteReason: null,
      },
    );
    return ok({ itemId: ref.id });
  } catch (e: unknown) {
    if (e instanceof FirebaseError) return err(`firestore/${e.code}`, e.message);
    return err('firestore/unknown', e instanceof Error ? e.message : String(e));
  }
}

/** Editable fields only. updateDoc keeps unspecified fields' server values. */
export interface UpdateItemParams {
  itemId: string;
  sku: string;
  description: string;
  supplier: string | null;
  price: number | null;
  minimumMeters: number;
  photoUrl: string | null;
  actorUid: string;
}

/**
 * Update a roll item's editable fields. Errors: `invalid-input`,
 * `firestore/no-db`, `firestore/init-failed`, `firestore/<FirestoreErrorCode>`
 * (e.g. `permission-denied` when item is soft-deleted), `firestore/unknown`.
 */
export async function updateItem(params: UpdateItemParams): Promise<Result<void>> {
  const trimmedSku = typeof params.sku === 'string' ? params.sku.trim() : '';
  if (!isNonEmpty(params.itemId)) return err('invalid-input', 'itemId is required.');
  if (trimmedSku === '') return err('invalid-input', 'sku is required.');
  const sharedErr = validateEditableFields(params);
  if (sharedErr) return err('invalid-input', sharedErr);

  const dbR = resolveDb();
  if (!dbR.ok) return dbR.result;
  const { db } = dbR;

  // No converter: updateDoc takes a partial patch. Omit immutable +
  // other-owned fields (createdAt/By, initialMeters, folderId/Ancestors,
  // remainingMeters, lastMovementId, deletedAt/By/Reason).
  try {
    const ref = doc(db, 'items', params.itemId);
    await updateDoc(ref, {
      sku: trimmedSku,
      description: params.description,
      supplier: params.supplier,
      price: params.price,
      minimumMeters: params.minimumMeters,
      photoUrl: params.photoUrl,
      updatedAt: serverTimestamp(),
      updatedBy: params.actorUid,
    });
    return ok(undefined);
  } catch (e: unknown) {
    if (e instanceof FirebaseError) return err(`firestore/${e.code}`, e.message);
    return err('firestore/unknown', e instanceof Error ? e.message : String(e));
  }
}
