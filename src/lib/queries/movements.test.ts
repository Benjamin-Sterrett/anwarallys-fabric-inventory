import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMovementAndAdjustItem } from './movements';
import { getDb } from '@/lib/firebase/app';

vi.mock('@/lib/firebase/app', () => ({
  getDb: vi.fn(),
}));

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
