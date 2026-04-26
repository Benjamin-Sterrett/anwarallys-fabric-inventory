// Firestore schema — single source of truth for collection shapes.
//
// Collections (flat, top-level):
//   /folders/{folderId}          — tree nodes
//   /items/{itemId}              — fabric rolls; itemId == Firestore auto-ID == QR payload, IMMUTABLE
//   /movements/{movementId}      — append-only audit log
//   /deletedRecords/{itemId}     — tombstone for 7-day restore + Firestore TTL purge
//
// Schema is locked in `research/synthesis.md` §1 (lines 37-103). Field names,
// types, and ordering follow that spec verbatim — drift here silently
// mismatches Security Rules (PRJ-805) and the Firestore writes in PRJ-780+.
//
// Read-vs-write timestamp semantics (`ServerTimestamp`):
//   - WRITES use `FieldValue` from `serverTimestamp()` so the server stamps
//     the field at commit time.
//   - READS (via `getDoc` / `onSnapshot`) come back as `Timestamp`.
// Consumers may want narrowed read/write types; that lives at the data
// boundary in PRJ-780, not here.
//
// `noUncheckedIndexedAccess` is on, so consumers indexing into `ancestors[]`,
// `folderAncestors[]`, etc. will see `string | undefined` and must narrow.
//
// Soft-delete contract (PRJ-796/797): the live `/items/{itemId}` doc stays
// in place with `deletedAt` set; `/deletedRecords/{itemId}` is the trash-bin
// entry holding a `RollItemSnapshot` and `expireAt`. The mechanics of *how*
// `deletedAt` and `expireAt` are stamped (server time vs client time, single
// transaction vs two-step) are implementation choices for PRJ-796, not part
// of this type contract.
//
// Atomic stock writes (PRJ-787): the client opens a `runTransaction()` that
// updates `RollItem.remainingMeters` AND creates the matching `Movement` doc
// in the same commit. Security Rules validate shape, required fields, and
// forbid update/delete on existing Movement docs — they do not perform writes.
//
// Authz surface: Firestore Security Rules. The Firebase web config is
// client-safe. Don't add `firebase-admin` (project invariant: client SDK only).

import type { Timestamp, FieldValue } from 'firebase/firestore';

/**
 * `Timestamp` on read, `FieldValue` on write (via `serverTimestamp()`).
 *
 * Convention: the only `FieldValue` permitted here is the one returned by
 * `serverTimestamp()`. The Firebase SDK does not export a narrower sentinel
 * type, so `Timestamp | FieldValue` is the most precise we can be at the type
 * level. Don't pass `increment()`, `arrayUnion()`, `deleteField()`, etc. into
 * a timestamp field — the type would allow it, but the resulting Firestore
 * write would be wrong. The data boundary in PRJ-780 will provide a small
 * write helper that accepts only `Timestamp` or `serverTimestamp()` to
 * enforce this at the call site.
 */
export type ServerTimestamp = Timestamp | FieldValue;

/**
 * Reason captured on every Movement. Picker UI in PRJ-788 imports this.
 */
export type MovementReason =
  | 'sold'
  | 'cut'
  | 'damage'
  | 'return'
  | 'correction'
  | 'receive'
  | 'other';

export interface Folder {
  folderId: string;
  name: string;
  /** `null` = root (Room). */
  parentId: string | null;
  /** Ordered root → parent. IDs only — survives folder rename. */
  ancestors: string[];
  depth: number;
  createdAt: ServerTimestamp;
  updatedAt: ServerTimestamp;
  createdBy: string;
  updatedBy: string;
  deletedAt: Timestamp | null;
  deletedBy: string | null;
}

export interface RollItem {
  /** Firestore auto-ID. Same value is the QR payload. IMMUTABLE after creation. */
  itemId: string;
  /** User-editable business code. SKU and item code are the same thing. */
  sku: string;
  /** Optional, 2–3 lines. */
  description: string;
  folderId: string;
  /** `folder.ancestors ++ [folderId]`. Denormalized for subtree queries. */
  folderAncestors: string[];
  /**
   * Source of truth for stock. The client mutates this only inside the
   * `runTransaction()` that also creates the matching Movement doc (PRJ-787).
   */
  remainingMeters: number;
  /** Original roll length. IMMUTABLE after creation. */
  initialMeters: number;
  /** Threshold for low-stock UI; see PRJ-798. Schema-level override hook. */
  minimumMeters: number;
  photoUrl: string | null;
  supplier: string | null;
  price: number | null;
  createdAt: ServerTimestamp;
  updatedAt: ServerTimestamp;
  createdBy: string;
  updatedBy: string;
  deletedAt: Timestamp | null;
  deletedBy: string | null;
  deleteReason: string | null;
}

/**
 * Append-only by Security Rules: once written, no update/delete is permitted.
 * The client creates a Movement atomically with the matching `RollItem`
 * `remainingMeters` update inside one `runTransaction()` (PRJ-787); Rules
 * validate the new doc but do not perform the write.
 */
export interface Movement {
  movementId: string;
  itemId: string;
  /** Folder context at the time of the change — survives item moves. */
  folderIdAtTime: string;
  folderAncestorsAtTime: string[];
  oldMeters: number;
  newMeters: number;
  deltaMeters: number;
  reason: MovementReason;
  note: string | null;
  /** Firebase Auth UID (PRJ-781). */
  actorUid: string;
  /** Denormalized display name; survives user deletion. */
  actorName: string;
  at: ServerTimestamp;
}

/**
 * `RollItem` shape captured at delete time, intentionally without the
 * soft-delete metadata. The delete fields live on the live `/items/{itemId}`
 * doc; the snapshot is the *active-state* the item had just before deletion.
 * If the live doc is ever missing, recovering from this snapshot produces a
 * clean un-deleted RollItem — exactly what we want when un-deleting.
 */
export type RollItemSnapshot = Omit<
  RollItem,
  'deletedAt' | 'deletedBy' | 'deleteReason'
>;

/**
 * 7-day soft-delete tombstone. `deletedAt` and `expireAt` are concrete
 * `Timestamp` values (not write-time sentinels) — the values are populated
 * by the delete flow in PRJ-796, which is responsible for picking a
 * clock-safe source (server-stamped or otherwise). This file only declares
 * the persisted shape. Firestore TTL on `expireAt` drives automatic purge.
 *
 * Restore (PRJ-797) clears the live `RollItem`'s delete fields; it does NOT
 * recreate the item from the snapshot. The snapshot is read for trash-bin
 * UI and as a recovery payload if the live doc is somehow missing.
 */
export interface DeletedRecord {
  itemId: string;
  snapshot: RollItemSnapshot;
  deletedAt: Timestamp;
  deletedBy: string;
  deleteReason: string | null;
  expireAt: Timestamp;
  folderIdAtDelete: string;
  folderAncestorsAtDelete: string[];
}
