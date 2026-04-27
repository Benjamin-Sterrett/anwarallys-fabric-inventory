import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMovementAndAdjustItem, findMovementByCorrelationId } from './movements';
import { getDb } from '@/lib/firebase/app';

vi.mock('@/lib/firebase/app', () => ({
  getDb: vi.fn(),
}));

const mockDoc = vi.fn();
const mockRunTransaction = vi.fn();
const mockGetDocsFromServer = vi.fn();
const mockServerTimestamp = vi.fn(() => 'server-timestamp');

const mockQuery = vi.fn();
const mockCollection = vi.fn();
const mockWhere = vi.fn();
const mockQueryLimit = vi.fn();

vi.mock('firebase/firestore', async () => {
  const actual = await vi.importActual<typeof import('firebase/firestore')>('firebase/firestore');
  return {
    ...actual,
    doc: (...args: unknown[]) => mockDoc(...args),
    runTransaction: (...args: unknown[]) => mockRunTransaction(...args),
    getDocsFromServer: (...args: unknown[]) => mockGetDocsFromServer(...args),
    serverTimestamp: () => mockServerTimestamp(),
    query: (...args: unknown[]) => mockQuery(...args),
    collection: (...args: unknown[]) => mockCollection(...args),
    where: (...args: unknown[]) => mockWhere(...args),
    limit: (...args: unknown[]) => mockQueryLimit(...args),
  };
});

const validParams = {
  itemId: 'item-1',
  expectedOldMeters: 100,
  newMeters: 80,
  reason: 'cut' as const,
  note: 'Cut 20m',
  actorUid: 'user-1',
  actorName: 'Alice',
};

describe('createMovementAndAdjustItem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects negative newMeters', async () => {
    const r = await createMovementAndAdjustItem({ ...validParams, newMeters: -5 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('invalid-meters');
      expect(r.error.message).toContain('newMeters');
    }
  });

  it('rejects NaN newMeters', async () => {
    const r = await createMovementAndAdjustItem({ ...validParams, newMeters: NaN });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('invalid-meters');
  });

  it('rejects negative expectedOldMeters', async () => {
    const r = await createMovementAndAdjustItem({ ...validParams, expectedOldMeters: -1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('invalid-meters');
  });

  it('rejects zero-delta adjustment', async () => {
    const r = await createMovementAndAdjustItem({ ...validParams, newMeters: 100 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('zero-delta');
      expect(r.error.message).toContain('No-op');
    }
  });

  it('rejects empty actorUid', async () => {
    const r = await createMovementAndAdjustItem({ ...validParams, actorUid: '' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('invalid-actor');
      expect(r.error.message).toContain('actorUid');
    }
  });

  it('rejects empty actorName', async () => {
    const r = await createMovementAndAdjustItem({ ...validParams, actorName: '' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('invalid-actor');
      expect(r.error.message).toContain('actorName');
    }
  });

  it('rejects empty reversesMovementId when set', async () => {
    const r = await createMovementAndAdjustItem({
      ...validParams,
      reversesMovementId: '',
      reason: 'correction',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('invalid-reversal');
    }
  });

  it('rejects reversesMovementId with non-correction reason', async () => {
    const r = await createMovementAndAdjustItem({
      ...validParams,
      reversesMovementId: 'mv-1',
      reason: 'cut',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('invalid-reversal');
      expect(r.error.message).toContain('correction');
    }
  });

  it('rejects empty clientCorrelationId when set', async () => {
    const r = await createMovementAndAdjustItem({ ...validParams, clientCorrelationId: '' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('invalid-correlation-id');
    }
  });

  it('returns firestore/no-db when Firebase is not configured', async () => {
    vi.mocked(getDb).mockReturnValue(null);
    const r = await createMovementAndAdjustItem(validParams);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('firestore/no-db');
    }
  });

  it('accepts valid reversal params (validation passes before db check)', async () => {
    vi.mocked(getDb).mockReturnValue(null);
    const r = await createMovementAndAdjustItem({
      ...validParams,
      newMeters: 90,
      reason: 'correction',
      reversesMovementId: 'mv-1',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('firestore/no-db');
    }
  });
});


describe('createMovementAndAdjustItem — idempotency (PRJ-892)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 'already-applied' when movement doc with same correlationId already exists", async () => {
    const fakeDb = { type: 'firestore' };
    vi.mocked(getDb).mockReturnValue(fakeDb as unknown as ReturnType<typeof getDb>);

    const correlationId = 'corr-abc-123';
    const fakeMovementRef = { id: correlationId, path: `movements/${correlationId}`, withConverter: vi.fn((c) => ({ ...fakeMovementRef, converter: c })) };
    const fakeItemRef = { id: 'item-1', path: 'items/item-1', withConverter: vi.fn((c) => ({ ...fakeItemRef, converter: c })) };

    mockDoc.mockImplementation((_db, collection, id) => {
      if (collection === 'movements') return fakeMovementRef;
      if (collection === 'items') return fakeItemRef;
      return { id, withConverter: vi.fn((c) => ({ id, converter: c })) };
    });

    mockRunTransaction.mockImplementation(async (_db, callback) => {
      const tx = {
        get: vi.fn(async (ref: typeof fakeMovementRef) => {
          if (ref.id === correlationId) {
            return { exists: () => true, data: () => ({ movementId: correlationId }) };
          }
          return { exists: () => false, data: () => null };
        }),
        update: vi.fn(),
        set: vi.fn(),
      };
      return callback(tx);
    });

    const r = await createMovementAndAdjustItem({
      ...validParams,
      clientCorrelationId: correlationId,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('already-applied');
    }
  });

  it('transaction reads movement before item', async () => {
    const fakeDb = { type: 'firestore' };
    vi.mocked(getDb).mockReturnValue(fakeDb as unknown as ReturnType<typeof getDb>);

    const correlationId = 'corr-def-456';
    const fakeMovementRef = { id: correlationId, path: `movements/${correlationId}`, withConverter: vi.fn((c) => ({ ...fakeMovementRef, converter: c })) };
    const fakeItemRef = { id: 'item-1', path: 'items/item-1', withConverter: vi.fn((c) => ({ ...fakeItemRef, converter: c })) };

    mockDoc.mockImplementation((_db, collection, id) => {
      if (collection === 'movements') return fakeMovementRef;
      if (collection === 'items') return fakeItemRef;
      return { id, withConverter: vi.fn((c) => ({ id, converter: c })) };
    });

    const getCalls: Array<{ id: string; collection: string }> = [];

    mockRunTransaction.mockImplementation(async (_db, callback) => {
      const tx = {
        get: vi.fn(async (ref: typeof fakeMovementRef) => {
          getCalls.push({ id: ref.id, collection: ref.path.split('/')[0]! });
          if (ref.id === correlationId) {
            return { exists: () => false, data: () => null };
          }
          return {
            exists: () => true,
            data: () => ({
              remainingMeters: validParams.expectedOldMeters,
              deletedAt: null,
              folderId: 'folder-1',
              folderAncestors: [],
            }),
          };
        }),
        update: vi.fn(),
        set: vi.fn(),
      };
      return callback(tx);
    });

    const r = await createMovementAndAdjustItem({
      ...validParams,
      clientCorrelationId: correlationId,
    });
    expect(r.ok).toBe(true);
    expect(getCalls.length).toBeGreaterThanOrEqual(2);
    expect(getCalls[0]!.id).toBe(correlationId);
    expect(getCalls[0]!.collection).toBe('movements');
    expect(getCalls[1]!.id).toBe('item-1');
    expect(getCalls[1]!.collection).toBe('items');
  });
});

describe('findMovementByCorrelationId (PRJ-892)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when no matching movement exists', async () => {
    const fakeDb = { type: 'firestore' };
    vi.mocked(getDb).mockReturnValue(fakeDb as unknown as ReturnType<typeof getDb>);

    const fakeQuery = { type: 'query' };
    mockCollection.mockReturnValue({
      withConverter: () => ({ type: 'collection' }),
    });
    mockQuery.mockReturnValue(fakeQuery);
    mockGetDocsFromServer.mockResolvedValue({
      docs: [],
    });

    const r = await findMovementByCorrelationId('item-1', 'corr-ghi-789', 'actor-1');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data).toBeNull();
    }
  });
});
