// Firestore converters. Doc-ID stripped on write, injected from
// `snapshot.id` on read. `toFirestore` takes `WithFieldValue<T>` so
// callers can pass `serverTimestamp()`.
//
// All converters request `serverTimestamps: 'estimate'` so reads of
// unresolved `serverTimestamp()` fields return a local-time estimate
// instead of `null` (the SDK default). With `persistentLocalCache`
// enabled, the local cache returns just-written docs before the server
// ACK lands; without 'estimate', `Movement.at` / `Folder.createdAt` /
// etc. would be `null` and `.toDate()` would crash. Once the server
// ACK arrives, subsequent reads return the canonical Timestamp.

import {
  type DocumentData,
  type FirestoreDataConverter,
  type QueryDocumentSnapshot,
  type SnapshotOptions,
  type WithFieldValue,
} from 'firebase/firestore';
import type { Folder, RollItem, Movement, DeletedRecord } from '@/lib/models';

export const folderConverter: FirestoreDataConverter<Folder> = {
  toFirestore(folder: WithFieldValue<Folder>): DocumentData {
    const { folderId: _strip, ...payload } = folder as Folder;
    return payload;
  },
  fromFirestore(snap: QueryDocumentSnapshot, options?: SnapshotOptions): Folder {
    const d = snap.data({ ...options, serverTimestamps: 'estimate' });
    return {
      folderId: snap.id,
      name: d.name,
      parentId: d.parentId ?? null,
      ancestors: d.ancestors ?? [],
      depth: d.depth,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      createdBy: d.createdBy,
      updatedBy: d.updatedBy,
      deletedAt: d.deletedAt ?? null,
      deletedBy: d.deletedBy ?? null,
    };
  },
};

export const itemConverter: FirestoreDataConverter<RollItem> = {
  toFirestore(item: WithFieldValue<RollItem>): DocumentData {
    const { itemId: _strip, ...payload } = item as RollItem;
    return payload;
  },
  fromFirestore(snap: QueryDocumentSnapshot, options?: SnapshotOptions): RollItem {
    const d = snap.data({ ...options, serverTimestamps: 'estimate' });
    return {
      itemId: snap.id,
      sku: d.sku,
      description: d.description ?? '',
      folderId: d.folderId,
      folderAncestors: d.folderAncestors ?? [],
      remainingMeters: d.remainingMeters,
      initialMeters: d.initialMeters,
      minimumMeters: d.minimumMeters,
      photoUrl: d.photoUrl ?? null,
      supplier: d.supplier ?? null,
      price: d.price ?? null,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      createdBy: d.createdBy,
      updatedBy: d.updatedBy,
      deletedAt: d.deletedAt ?? null,
      deletedBy: d.deletedBy ?? null,
      deleteReason: d.deleteReason ?? null,
    };
  },
};

export const movementConverter: FirestoreDataConverter<Movement> = {
  toFirestore(movement: WithFieldValue<Movement>): DocumentData {
    const { movementId: _strip, ...payload } = movement as Movement;
    return payload;
  },
  fromFirestore(snap: QueryDocumentSnapshot, options?: SnapshotOptions): Movement {
    const d = snap.data({ ...options, serverTimestamps: 'estimate' });
    return {
      movementId: snap.id,
      itemId: d.itemId,
      folderIdAtTime: d.folderIdAtTime,
      folderAncestorsAtTime: d.folderAncestorsAtTime ?? [],
      oldMeters: d.oldMeters,
      newMeters: d.newMeters,
      deltaMeters: d.deltaMeters,
      reason: d.reason,
      note: d.note ?? null,
      actorUid: d.actorUid,
      actorName: d.actorName,
      at: d.at,
    };
  },
};

export const deletedRecordConverter: FirestoreDataConverter<DeletedRecord> = {
  // `itemId` is the doc-ID — reused as tombstone ID for 1:1 PRJ-797 restore.
  toFirestore(record: WithFieldValue<DeletedRecord>): DocumentData {
    const { itemId: _strip, ...payload } = record as DeletedRecord;
    return payload;
  },
  fromFirestore(snap: QueryDocumentSnapshot, options?: SnapshotOptions): DeletedRecord {
    const d = snap.data({ ...options, serverTimestamps: 'estimate' });
    return {
      itemId: snap.id,
      snapshot: d.snapshot,
      deletedAt: d.deletedAt,
      deletedBy: d.deletedBy,
      deleteReason: d.deleteReason ?? null,
      expireAt: d.expireAt,
      folderIdAtDelete: d.folderIdAtDelete,
      folderAncestorsAtDelete: d.folderAncestorsAtDelete ?? [],
    };
  },
};
