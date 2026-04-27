import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createItem, updateItem } from './items';
import { getDb } from '@/lib/firebase/app';
import { addDoc, updateDoc } from 'firebase/firestore';

vi.mock('@/lib/firebase/app', () => ({
  getDb: vi.fn(),
}));

vi.mock('firebase/firestore', async () => {
  const actual = await vi.importActual<typeof import('firebase/firestore')>('firebase/firestore');
  return {
    ...actual,
    addDoc: vi.fn(),
    updateDoc: vi.fn(),
    doc: vi.fn(() => ({ withConverter: () => ({}) })),
    collection: vi.fn(() => ({ withConverter: () => ({}) })),
    serverTimestamp: vi.fn(() => 'SERVER_TS'),
  };
});

const validCreate = {
  folderId: 'folder-1',
  folderAncestors: ['root', 'folder-1'],
  sku: 'SKU-123',
  description: 'Test fabric',
  initialMeters: 100,
  minimumMeters: 10,
  supplier: 'Supplier A' as string | null,
  price: 50 as number | null,
  photoUrl: 'http://example.com/photo.jpg' as string | null,
  actorUid: 'user-1',
};

const validUpdate = {
  itemId: 'item-1',
  sku: 'SKU-123',
  description: 'Test fabric',
  supplier: 'Supplier A' as string | null,
  price: 50 as number | null,
  minimumMeters: 10,
  photoUrl: 'http://example.com/photo.jpg' as string | null,
  actorUid: 'user-1',
};

describe('createItem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects empty sku', async () => {
    const r = await createItem({ ...validCreate, sku: '' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('invalid-input');
      expect(r.error.message).toContain('sku');
    }
  });

  it('rejects whitespace-only sku', async () => {
    const r = await createItem({ ...validCreate, sku: '   ' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('invalid-input');
  });

  it('rejects missing folderId', async () => {
    const r = await createItem({ ...validCreate, folderId: '' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('invalid-input');
  });

  it('rejects empty folderAncestors', async () => {
    const r = await createItem({ ...validCreate, folderAncestors: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toContain('folderAncestors');
  });

  it('rejects folderAncestors not ending with folderId', async () => {
    const r = await createItem({ ...validCreate, folderAncestors: ['root', 'other'] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toContain('folderAncestors');
  });

  it('rejects non-positive initialMeters', async () => {
    const r = await createItem({ ...validCreate, initialMeters: 0 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('invalid-input');
  });

  it('rejects negative initialMeters', async () => {
    const r = await createItem({ ...validCreate, initialMeters: -5 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('invalid-input');
  });

  it('rejects negative minimumMeters', async () => {
    const r = await createItem({ ...validCreate, minimumMeters: -1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('invalid-input');
  });

  it('rejects NaN minimumMeters', async () => {
    const r = await createItem({ ...validCreate, minimumMeters: NaN });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('invalid-input');
  });

  it('rejects missing actorUid', async () => {
    const r = await createItem({ ...validCreate, actorUid: '' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toContain('actorUid');
  });

  it('rejects non-string description', async () => {
    const r = await createItem({ ...validCreate, description: 123 as unknown as string });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('invalid-input');
  });

  it('rejects invalid supplier type', async () => {
    const r = await createItem({ ...validCreate, supplier: 123 as unknown as string });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('invalid-input');
  });

  it('rejects invalid photoUrl type', async () => {
    const r = await createItem({ ...validCreate, photoUrl: 123 as unknown as string });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('invalid-input');
  });

  it('rejects negative price', async () => {
    const r = await createItem({ ...validCreate, price: -10 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('invalid-input');
  });

  it('returns firestore/no-db when Firebase is not configured', async () => {
    vi.mocked(getDb).mockReturnValue(null);
    const r = await createItem(validCreate);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('firestore/no-db');
      expect(r.error.message).toContain('not configured');
    }
  });

  it('writes the full schema-conformant payload to addDoc', async () => {
    vi.mocked(getDb).mockReturnValue({} as any);
    vi.mocked(addDoc).mockResolvedValue({ id: 'new-item-id' } as any);

    const r = await createItem(validCreate);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data).toEqual({ itemId: 'new-item-id' });
    }
    expect(addDoc).toHaveBeenCalledTimes(1);

    const call = vi.mocked(addDoc).mock.calls[0]!;
    const [, payload] = call;
    expect(payload).toEqual({
      itemId: '',
      sku: 'SKU-123',
      description: 'Test fabric',
      folderId: 'folder-1',
      folderAncestors: ['root', 'folder-1'],
      remainingMeters: 100,
      lastMovementId: null,
      initialMeters: 100,
      minimumMeters: 10,
      photoUrl: 'http://example.com/photo.jpg',
      supplier: 'Supplier A',
      price: 50,
      createdAt: 'SERVER_TS',
      updatedAt: 'SERVER_TS',
      createdBy: 'user-1',
      updatedBy: 'user-1',
      deletedAt: null,
      deletedBy: null,
      deleteReason: null,
    });
  });
});

describe('updateItem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects empty itemId', async () => {
    const r = await updateItem({ ...validUpdate, itemId: '' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('invalid-input');
  });

  it('rejects empty sku', async () => {
    const r = await updateItem({ ...validUpdate, sku: '' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('invalid-input');
  });

  it('rejects negative minimumMeters', async () => {
    const r = await updateItem({ ...validUpdate, minimumMeters: -1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('invalid-input');
  });

  it('rejects missing actorUid', async () => {
    const r = await updateItem({ ...validUpdate, actorUid: '' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toContain('actorUid');
  });

  it('returns firestore/no-db when Firebase is not configured', async () => {
    vi.mocked(getDb).mockReturnValue(null);
    const r = await updateItem(validUpdate);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('firestore/no-db');
    }
  });

  it('writes ONLY the editable fields to updateDoc', async () => {
    vi.mocked(getDb).mockReturnValue({} as any);
    vi.mocked(updateDoc).mockResolvedValue(undefined as any);

    const r = await updateItem(validUpdate);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data).toBeUndefined();
    }
    expect(updateDoc).toHaveBeenCalledTimes(1);

    const call = vi.mocked(updateDoc).mock.calls[0]!;
    const [, payload] = call;
    expect(payload).toEqual({
      sku: 'SKU-123',
      description: 'Test fabric',
      supplier: 'Supplier A',
      price: 50,
      minimumMeters: 10,
      photoUrl: 'http://example.com/photo.jpg',
      updatedAt: 'SERVER_TS',
      updatedBy: 'user-1',
    });
  });

  it('write payload does NOT contain stock or immutable fields', async () => {
    vi.mocked(getDb).mockReturnValue({} as any);
    vi.mocked(updateDoc).mockResolvedValue(undefined as any);

    const r = await updateItem(validUpdate);
    expect(r.ok).toBe(true);

    const call = vi.mocked(updateDoc).mock.calls[0]!;
    const [, pload] = call;
    const forbidden = [
      'remainingMeters', 'lastMovementId', 'initialMeters',
      'folderId', 'folderAncestors',
      'deletedAt', 'deletedBy', 'deleteReason',
      'createdAt', 'createdBy',
    ];
    for (const k of forbidden) expect(pload).not.toHaveProperty(k);
  });

  it('trims sku before writing', async () => {
    vi.mocked(getDb).mockReturnValue({} as any);
    vi.mocked(updateDoc).mockResolvedValue(undefined as any);

    const r = await updateItem({ ...validUpdate, sku: '  SKU-123  ' });
    expect(r.ok).toBe(true);

    const call = vi.mocked(updateDoc).mock.calls[0]!;
    const [, pload] = call;
    expect((pload as unknown as Record<string, unknown>).sku).toBe('SKU-123');
  });
});
