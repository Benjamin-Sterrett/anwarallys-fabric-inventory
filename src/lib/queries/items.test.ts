import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createItem, updateItem } from './items';
import { getDb } from '@/lib/firebase/app';

vi.mock('@/lib/firebase/app', () => ({
  getDb: vi.fn(),
}));

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
});
