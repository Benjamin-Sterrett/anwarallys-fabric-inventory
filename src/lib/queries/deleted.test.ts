import { describe, it, expect, vi, beforeEach } from 'vitest';
import { softDeleteItem, softDeleteFolder, restoreItem, restoreFolder, getFolderSubtreeIsEmpty } from './deleted';
import { getDb } from '@/lib/firebase/app';

vi.mock('@/lib/firebase/app', () => ({
  getDb: vi.fn(),
}));

const mockDoc = vi.fn();
const mockRunTransaction = vi.fn();
const mockGetCountFromServer = vi.fn();
const mockCollection = vi.fn();
const mockQuery = vi.fn();
const mockWhere = vi.fn();
const mockServerTimestamp = vi.fn(() => 'server-timestamp');
const mockGetDoc = vi.fn();
const mockUpdateDoc = vi.fn();

vi.mock('firebase/firestore', async () => {
  const actual = await vi.importActual<typeof import('firebase/firestore')>('firebase/firestore');
  return {
    ...actual,
    doc: (...args: unknown[]) => mockDoc(...args),
    runTransaction: (...args: unknown[]) => mockRunTransaction(...args),
    getCountFromServer: (...args: unknown[]) => mockGetCountFromServer(...args),
    collection: (...args: unknown[]) => mockCollection(...args),
    query: (...args: unknown[]) => mockQuery(...args),
    where: (...args: unknown[]) => mockWhere(...args),
    getDoc: (...args: unknown[]) => mockGetDoc(...args),
    updateDoc: (...args: unknown[]) => mockUpdateDoc(...args),
    serverTimestamp: () => mockServerTimestamp(),
    Timestamp: {
      fromMillis: (ms: number) => ({ toMillis: () => ms, seconds: Math.floor(ms / 1000), nanoseconds: 0 }),
    },
  };
});

describe('softDeleteItem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects empty itemId', async () => {
    const r = await softDeleteItem('', 'reason', 'uid-1');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('invalid-input');
      expect(r.error.message).toContain('itemId');
    }
  });

  it('rejects empty actorUid', async () => {
    const r = await softDeleteItem('item-1', 'reason', '');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('invalid-input');
      expect(r.error.message).toContain('actorUid');
    }
  });

  it('returns firestore/no-db when Firebase is not configured', async () => {
    vi.mocked(getDb).mockReturnValue(null);
    const r = await softDeleteItem('item-1', 'reason', 'uid-1');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('firestore/no-db');
    }
  });

  it('transaction updates item and creates tombstone', async () => {
    const fakeDb = { type: 'firestore' };
    vi.mocked(getDb).mockReturnValue(fakeDb as unknown as ReturnType<typeof getDb>);

    const fakeItemRef = { id: 'item-1', path: 'items/item-1', withConverter: vi.fn((c) => ({ ...fakeItemRef, converter: c })) };
    const fakeRecordRef = { id: 'item-1', path: 'deletedRecords/item-1', withConverter: vi.fn((c) => ({ ...fakeRecordRef, converter: c })) };

    mockDoc.mockImplementation((_db, collection, id) => {
      if (collection === 'items') return fakeItemRef;
      if (collection === 'deletedRecords') return fakeRecordRef;
      return { id, withConverter: vi.fn((c) => ({ id, converter: c })) };
    });

    const txUpdates: Array<{ ref: unknown; data: unknown }> = [];
    const txSets: Array<{ ref: unknown; data: unknown }> = [];

    mockRunTransaction.mockImplementation(async (_db, callback) => {
      const tx = {
        get: vi.fn(async (ref: typeof fakeItemRef) => {
          if (ref.path === 'items/item-1') {
            return {
              exists: () => true,
              data: () => ({
                itemId: 'item-1',
                sku: 'SKU-1',
                description: 'Test',
                folderId: 'folder-1',
                folderAncestors: ['root', 'folder-1'],
                remainingMeters: 100,
                lastMovementId: null,
                initialMeters: 100,
                minimumMeters: 10,
                photoUrl: null,
                supplier: null,
                price: null,
                createdAt: { toMillis: () => 0 },
                updatedAt: { toMillis: () => 0 },
                createdBy: 'user-a',
                updatedBy: 'user-a',
                deletedAt: null,
                deletedBy: null,
                deleteReason: null,
              }),
            };
          }
          return { exists: () => false, data: () => null };
        }),
        update: vi.fn((ref, data) => { txUpdates.push({ ref, data }); }),
        set: vi.fn((ref, data) => { txSets.push({ ref, data }); }),
      };
      return callback(tx);
    });

    const r = await softDeleteItem('item-1', 'No longer needed', 'uid-1');
    expect(r.ok).toBe(true);

    // Should update the item doc
    expect(txUpdates.length).toBe(1);
    expect(txUpdates[0]!.ref).toMatchObject({ path: 'items/item-1' });

    // Should create the tombstone
    expect(txSets.length).toBe(1);
    expect(txSets[0]!.ref).toMatchObject({ path: 'deletedRecords/item-1' });
    const tombstone = txSets[0]!.data as Record<string, unknown>;
    expect(tombstone.snapshot).toBeDefined();
    expect(tombstone.deletedBy).toBe('uid-1');
    expect(tombstone.deleteReason).toBe('No longer needed');
    expect(tombstone.folderIdAtDelete).toBe('folder-1');
    expect(tombstone.folderAncestorsAtDelete).toEqual(['root', 'folder-1']);
    expect(tombstone.expireAt).toBeDefined();
  });
});

describe('softDeleteFolder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects empty folderId', async () => {
    const r = await softDeleteFolder('', 'reason', 'uid-1');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('invalid-input');
      expect(r.error.message).toContain('folderId');
    }
  });

  it('rejects empty actorUid', async () => {
    const r = await softDeleteFolder('folder-1', 'reason', '');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('invalid-input');
      expect(r.error.message).toContain('actorUid');
    }
  });

  it('transaction updates folder with deleteReason', async () => {
    const fakeDb = { type: 'firestore' };
    vi.mocked(getDb).mockReturnValue(fakeDb as unknown as ReturnType<typeof getDb>);

    const fakeFolderRef = { id: 'folder-1', path: 'folders/folder-1', withConverter: vi.fn((c) => ({ ...fakeFolderRef, converter: c })) };

    mockDoc.mockImplementation((_db, collection, id) => {
      if (collection === 'folders') return fakeFolderRef;
      return { id, withConverter: vi.fn((c) => ({ id, converter: c })) };
    });

    const txUpdates: Array<{ ref: unknown; data: unknown }> = [];

    mockRunTransaction.mockImplementation(async (_db, callback) => {
      const tx = {
        get: vi.fn(async (ref: typeof fakeFolderRef) => {
          if (ref.path === 'folders/folder-1') {
            return {
              exists: () => true,
              data: () => ({
                folderId: 'folder-1',
                name: 'Test Folder',
                parentId: null,
                ancestors: [],
                depth: 0,
                createdAt: { toMillis: () => 0 },
                updatedAt: { toMillis: () => 0 },
                createdBy: 'user-a',
                updatedBy: 'user-a',
                deletedAt: null,
                deletedBy: null,
                deleteReason: null,
              }),
            };
          }
          return { exists: () => false, data: () => null };
        }),
        update: vi.fn((ref, data) => { txUpdates.push({ ref, data }); }),
        set: vi.fn(() => undefined),
      };
      return callback(tx);
    });

    const r = await softDeleteFolder('folder-1', 'No longer needed', 'uid-1');
    expect(r.ok).toBe(true);

    expect(txUpdates.length).toBe(1);
    expect(txUpdates[0]!.ref).toMatchObject({ path: 'folders/folder-1' });
    const updateData = txUpdates[0]!.data as Record<string, unknown>;
    expect(updateData.deletedAt).toBe('server-timestamp');
    expect(updateData.deletedBy).toBe('uid-1');
    expect(updateData.deleteReason).toBe('No longer needed');
    expect(updateData.updatedBy).toBe('uid-1');
  });
});

describe('restoreItem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects empty itemId', async () => {
    const r = await restoreItem('', 'uid-1');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('invalid-input');
      expect(r.error.message).toContain('itemId');
    }
  });

  it('rejects empty actorUid', async () => {
    const r = await restoreItem('item-1', '');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('invalid-input');
      expect(r.error.message).toContain('actorUid');
    }
  });

  it('returns firestore/no-db when Firebase is not configured', async () => {
    vi.mocked(getDb).mockReturnValue(null);
    const r = await restoreItem('item-1', 'uid-1');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('firestore/no-db');
    }
  });

  it('transaction restores item when parent is active', async () => {
    const fakeDb = { type: 'firestore' };
    vi.mocked(getDb).mockReturnValue(fakeDb as unknown as ReturnType<typeof getDb>);

    const fakeItemRef = { id: 'item-1', path: 'items/item-1', withConverter: vi.fn((c) => ({ ...fakeItemRef, converter: c })) };
    const fakeFolderRef = { id: 'folder-1', path: 'folders/folder-1', withConverter: vi.fn((c) => ({ ...fakeFolderRef, converter: c })) };

    mockDoc.mockImplementation((_db, collection, id) => {
      if (collection === 'items' && id === 'item-1') return fakeItemRef;
      if (collection === 'folders' && id === 'folder-1') return fakeFolderRef;
      return { id, withConverter: vi.fn((c) => ({ id, converter: c })) };
    });

    const txUpdates: Array<{ ref: unknown; data: unknown }> = [];

    mockRunTransaction.mockImplementation(async (_db, callback) => {
      const tx = {
        get: vi.fn(async (ref: typeof fakeItemRef | typeof fakeFolderRef) => {
          if (ref.path === 'items/item-1') {
            return {
              exists: () => true,
              data: () => ({
                itemId: 'item-1',
                sku: 'SKU-1',
                description: 'Test',
                folderId: 'folder-1',
                folderAncestors: ['root', 'folder-1'],
                remainingMeters: 100,
                lastMovementId: null,
                initialMeters: 100,
                minimumMeters: 10,
                photoUrl: null,
                supplier: null,
                price: null,
                createdAt: { toMillis: () => 0 },
                updatedAt: { toMillis: () => 0 },
                createdBy: 'user-a',
                updatedBy: 'user-a',
                deletedAt: { toMillis: () => 1000 },
                deletedBy: 'user-b',
                deleteReason: 'Damaged',
              }),
            };
          }
          if (ref.path === 'folders/folder-1') {
            return {
              exists: () => true,
              data: () => ({
                folderId: 'folder-1',
                name: 'Test Folder',
                parentId: null,
                ancestors: [],
                depth: 0,
                createdAt: { toMillis: () => 0 },
                updatedAt: { toMillis: () => 0 },
                createdBy: 'user-a',
                updatedBy: 'user-a',
                deletedAt: null,
                deletedBy: null,
                deleteReason: null,
              }),
            };
          }
          return { exists: () => false, data: () => null };
        }),
        update: vi.fn((ref, data) => { txUpdates.push({ ref, data }); }),
      };
      return callback(tx);
    });

    const r = await restoreItem('item-1', 'uid-1');
    expect(r.ok).toBe(true);

    expect(txUpdates.length).toBe(1);
    expect(txUpdates[0]!.ref).toMatchObject({ path: 'items/item-1' });
    const updateData = txUpdates[0]!.data as Record<string, unknown>;
    expect(updateData.deletedAt).toBeNull();
    expect(updateData.deletedBy).toBeNull();
    expect(updateData.deleteReason).toBeNull();
    expect(updateData.updatedBy).toBe('uid-1');
  });

  it('returns item-not-deleted when item is not deleted', async () => {
    const fakeDb = { type: 'firestore' };
    vi.mocked(getDb).mockReturnValue(fakeDb as unknown as ReturnType<typeof getDb>);

    const fakeItemRef = { id: 'item-1', path: 'items/item-1', withConverter: vi.fn((c) => ({ ...fakeItemRef, converter: c })) };

    mockDoc.mockImplementation((_db, collection, id) => {
      if (collection === 'items' && id === 'item-1') return fakeItemRef;
      return { id, withConverter: vi.fn((c) => ({ id, converter: c })) };
    });

    mockRunTransaction.mockImplementation(async (_db, callback) => {
      const tx = {
        get: vi.fn(async (ref: typeof fakeItemRef) => {
          if (ref.path === 'items/item-1') {
            return {
              exists: () => true,
              data: () => ({
                itemId: 'item-1',
                sku: 'SKU-1',
                description: 'Test',
                folderId: 'folder-1',
                folderAncestors: ['root', 'folder-1'],
                remainingMeters: 100,
                lastMovementId: null,
                initialMeters: 100,
                minimumMeters: 10,
                photoUrl: null,
                supplier: null,
                price: null,
                createdAt: { toMillis: () => 0 },
                updatedAt: { toMillis: () => 0 },
                createdBy: 'user-a',
                updatedBy: 'user-a',
                deletedAt: null,
                deletedBy: null,
                deleteReason: null,
              }),
            };
          }
          return { exists: () => false, data: () => null };
        }),
        update: vi.fn(() => undefined),
      };
      return callback(tx);
    });

    const r = await restoreItem('item-1', 'uid-1');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('item-not-deleted');
    }
  });

  it('returns parent-deleted when parent folder is soft-deleted', async () => {
    const fakeDb = { type: 'firestore' };
    vi.mocked(getDb).mockReturnValue(fakeDb as unknown as ReturnType<typeof getDb>);

    const fakeItemRef = { id: 'item-1', path: 'items/item-1', withConverter: vi.fn((c) => ({ ...fakeItemRef, converter: c })) };
    const fakeFolderRef = { id: 'folder-1', path: 'folders/folder-1', withConverter: vi.fn((c) => ({ ...fakeFolderRef, converter: c })) };

    mockDoc.mockImplementation((_db, collection, id) => {
      if (collection === 'items' && id === 'item-1') return fakeItemRef;
      if (collection === 'folders' && id === 'folder-1') return fakeFolderRef;
      return { id, withConverter: vi.fn((c) => ({ id, converter: c })) };
    });

    mockRunTransaction.mockImplementation(async (_db, callback) => {
      const tx = {
        get: vi.fn(async (ref: typeof fakeItemRef | typeof fakeFolderRef) => {
          if (ref.path === 'items/item-1') {
            return {
              exists: () => true,
              data: () => ({
                itemId: 'item-1',
                sku: 'SKU-1',
                description: 'Test',
                folderId: 'folder-1',
                folderAncestors: ['root', 'folder-1'],
                remainingMeters: 100,
                lastMovementId: null,
                initialMeters: 100,
                minimumMeters: 10,
                photoUrl: null,
                supplier: null,
                price: null,
                createdAt: { toMillis: (): number => 0 },
                updatedAt: { toMillis: (): number => 0 },
                createdBy: 'user-a',
                updatedBy: 'user-a',
                deletedAt: { toMillis: (): number => 1000 },
                deletedBy: 'user-b',
                deleteReason: 'Damaged',
              }),
            };
          }
          if (ref.path === 'folders/folder-1') {
            return {
              exists: () => true,
              data: () => ({
                folderId: 'folder-1',
                name: 'Test Folder',
                parentId: null,
                ancestors: [],
                depth: 0,
                createdAt: { toMillis: (): number => 0 },
                updatedAt: { toMillis: (): number => 0 },
                createdBy: 'user-a',
                updatedBy: 'user-a',
                deletedAt: { toMillis: (): number => 1000 },
                deletedBy: 'user-b',
                deleteReason: 'No longer needed',
              }),
            };
          }
          return { exists: () => false, data: () => null };
        }),
        update: vi.fn(() => undefined),
      };
      return callback(tx);
    });

    const r = await restoreItem('item-1', 'uid-1');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('parent-deleted');
    }
  });
});

describe('restoreFolder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects empty folderId', async () => {
    const r = await restoreFolder('', 'uid-1');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('invalid-input');
      expect(r.error.message).toContain('folderId');
    }
  });

  it('rejects empty actorUid', async () => {
    const r = await restoreFolder('folder-1', '');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('invalid-input');
      expect(r.error.message).toContain('actorUid');
    }
  });

  it('returns firestore/no-db when Firebase is not configured', async () => {
    vi.mocked(getDb).mockReturnValue(null);
    const r = await restoreFolder('folder-1', 'uid-1');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('firestore/no-db');
    }
  });

  it('restores folder when parent is active', async () => {
    const fakeDb = { type: 'firestore' };
    vi.mocked(getDb).mockReturnValue(fakeDb as unknown as ReturnType<typeof getDb>);

    const fakeFolderRef = { id: 'folder-1', path: 'folders/folder-1', withConverter: vi.fn((c) => ({ ...fakeFolderRef, converter: c })) };
    const fakeParentRef = { id: 'parent-1', path: 'folders/parent-1', withConverter: vi.fn((c) => ({ ...fakeParentRef, converter: c })) };

    mockDoc.mockImplementation((_db, collection, id) => {
      if (collection === 'folders' && id === 'folder-1') return fakeFolderRef;
      if (collection === 'folders' && id === 'parent-1') return fakeParentRef;
      return { id, withConverter: vi.fn((c) => ({ id, converter: c })) };
    });

    const txUpdates: Array<{ ref: unknown; data: unknown }> = [];

    mockRunTransaction.mockImplementation(async (_db, callback) => {
      const tx = {
        get: vi.fn(async (ref: typeof fakeFolderRef | typeof fakeParentRef) => {
          if (ref.path === 'folders/folder-1') {
            return {
              exists: () => true,
              data: () => ({
                folderId: 'folder-1',
                name: 'Test Folder',
                parentId: 'parent-1',
                ancestors: ['parent-1'],
                depth: 1,
                createdAt: { toMillis: () => 0 },
                updatedAt: { toMillis: () => 0 },
                createdBy: 'user-a',
                updatedBy: 'user-a',
                deletedAt: { toMillis: () => 1000 },
                deletedBy: 'user-b',
                deleteReason: 'No longer needed',
              }),
            };
          }
          if (ref.path === 'folders/parent-1') {
            return {
              exists: () => true,
              data: () => ({
                folderId: 'parent-1',
                name: 'Parent Folder',
                parentId: null,
                ancestors: [],
                depth: 0,
                createdAt: { toMillis: () => 0 },
                updatedAt: { toMillis: () => 0 },
                createdBy: 'user-a',
                updatedBy: 'user-a',
                deletedAt: null,
                deletedBy: null,
                deleteReason: null,
              }),
            };
          }
          return { exists: () => false, data: () => null };
        }),
        update: vi.fn((ref, data) => { txUpdates.push({ ref, data }); }),
      };
      return callback(tx);
    });

    const r = await restoreFolder('folder-1', 'uid-1');
    expect(r.ok).toBe(true);

    expect(txUpdates.length).toBe(1);
    expect(txUpdates[0]).toMatchObject({
      ref: expect.objectContaining({ path: 'folders/folder-1' }),
      data: expect.objectContaining({
        deletedAt: null,
        deletedBy: null,
        deleteReason: null,
        updatedBy: 'uid-1',
      }),
    });
  });

  it('returns folder-not-deleted when folder is not deleted', async () => {
    const fakeDb = { type: 'firestore' };
    vi.mocked(getDb).mockReturnValue(fakeDb as unknown as ReturnType<typeof getDb>);

    const fakeFolderRef = { id: 'folder-1', path: 'folders/folder-1', withConverter: vi.fn((c) => ({ ...fakeFolderRef, converter: c })) };

    mockDoc.mockImplementation((_db, collection, id) => {
      if (collection === 'folders' && id === 'folder-1') return fakeFolderRef;
      return { id, withConverter: vi.fn((c) => ({ id, converter: c })) };
    });

    mockRunTransaction.mockImplementation(async (_db, callback) => {
      const tx = {
        get: vi.fn(async () => ({
          exists: () => true,
          data: () => ({
            folderId: 'folder-1',
            name: 'Test Folder',
            parentId: null,
            ancestors: [],
            depth: 0,
            createdAt: { toMillis: () => 0 },
            updatedAt: { toMillis: () => 0 },
            createdBy: 'user-a',
            updatedBy: 'user-a',
            deletedAt: null,
            deletedBy: null,
            deleteReason: null,
          }),
        })),
        update: vi.fn(() => undefined),
      };
      return callback(tx);
    });

    const r = await restoreFolder('folder-1', 'uid-1');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('folder-not-deleted');
    }
  });

  it('returns parent-deleted when parent folder is soft-deleted', async () => {
    const fakeDb = { type: 'firestore' };
    vi.mocked(getDb).mockReturnValue(fakeDb as unknown as ReturnType<typeof getDb>);

    const fakeFolderRef = { id: 'folder-1', path: 'folders/folder-1', withConverter: vi.fn((c) => ({ ...fakeFolderRef, converter: c })) };
    const fakeParentRef = { id: 'parent-1', path: 'folders/parent-1', withConverter: vi.fn((c) => ({ ...fakeParentRef, converter: c })) };

    mockDoc.mockImplementation((_db, collection, id) => {
      if (collection === 'folders' && id === 'folder-1') return fakeFolderRef;
      if (collection === 'folders' && id === 'parent-1') return fakeParentRef;
      return { id, withConverter: vi.fn((c) => ({ id, converter: c })) };
    });

    mockRunTransaction.mockImplementation(async (_db, callback) => {
      const tx = {
        get: vi.fn(async (ref: typeof fakeFolderRef | typeof fakeParentRef) => {
          if (ref.path === 'folders/folder-1') {
            return {
              exists: () => true,
              data: () => ({
                folderId: 'folder-1',
                name: 'Test Folder',
                parentId: 'parent-1',
                ancestors: ['parent-1'],
                depth: 1,
                createdAt: { toMillis: () => 0 },
                updatedAt: { toMillis: () => 0 },
                createdBy: 'user-a',
                updatedBy: 'user-a',
                deletedAt: { toMillis: () => 1000 },
                deletedBy: 'user-b',
                deleteReason: 'No longer needed',
              }),
            };
          }
          if (ref.path === 'folders/parent-1') {
            return {
              exists: () => true,
              data: () => ({
                folderId: 'parent-1',
                name: 'Parent Folder',
                parentId: null,
                ancestors: [],
                depth: 0,
                createdAt: { toMillis: () => 0 },
                updatedAt: { toMillis: () => 0 },
                createdBy: 'user-a',
                updatedBy: 'user-a',
                deletedAt: { toMillis: () => 1000 },
                deletedBy: 'user-b',
                deleteReason: 'No longer needed',
              }),
            };
          }
          return { exists: () => false, data: () => null };
        }),
        update: vi.fn(() => undefined),
      };
      return callback(tx);
    });

    const r = await restoreFolder('folder-1', 'uid-1');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('parent-deleted');
    }
  });
});

describe('getFolderSubtreeIsEmpty', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects empty folderId', async () => {
    const r = await getFolderSubtreeIsEmpty('');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('invalid-input');
      expect(r.error.message).toContain('folderId');
    }
  });

  it('returns correct counts when both queries succeed', async () => {
    const fakeDb = { type: 'firestore' };
    vi.mocked(getDb).mockReturnValue(fakeDb as unknown as ReturnType<typeof getDb>);

    mockCollection.mockReturnValue({ withConverter: () => ({ type: 'collection' }) });
    mockQuery.mockReturnValue({ type: 'query' });

    mockGetCountFromServer
      .mockResolvedValueOnce({ data: () => ({ count: 3 }) })
      .mockResolvedValueOnce({ data: () => ({ count: 2 }) });

    const r = await getFolderSubtreeIsEmpty('folder-1');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.itemCount).toBe(3);
      expect(r.data.folderCount).toBe(2);
      expect(r.data.empty).toBe(false);
    }
  });

  it('returns empty true when both counts are zero', async () => {
    const fakeDb = { type: 'firestore' };
    vi.mocked(getDb).mockReturnValue(fakeDb as unknown as ReturnType<typeof getDb>);

    mockCollection.mockReturnValue({ withConverter: () => ({ type: 'collection' }) });
    mockQuery.mockReturnValue({ type: 'query' });
    mockGetCountFromServer.mockResolvedValue({ data: () => ({ count: 0 }) });

    const r = await getFolderSubtreeIsEmpty('folder-1');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.itemCount).toBe(0);
      expect(r.data.folderCount).toBe(0);
      expect(r.data.empty).toBe(true);
    }
  });
});
