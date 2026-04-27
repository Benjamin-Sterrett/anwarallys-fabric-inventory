import { describe, it, expect, vi } from 'vitest';
import { randomUUIDv4 } from './uuid';

describe('randomUUIDv4()', () => {
  it('returns a 36-character UUID string', () => {
    const id = randomUUIDv4();
    expect(typeof id).toBe('string');
    expect(id).toHaveLength(36);
  });

  it('matches the standard UUID v4 pattern', () => {
    const id = randomUUIDv4();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('produces unique values across multiple calls', () => {
    const ids = new Set(Array.from({ length: 100 }, () => randomUUIDv4()));
    expect(ids.size).toBe(100);
  });

  it('falls back to getRandomValues when randomUUID is unavailable', () => {
    const getRandomValues = vi.fn((typedArray: Uint8Array) => {
      // Deterministic bytes for reproducibility.
      for (let i = 0; i < typedArray.length; i++) {
        typedArray[i] = i;
      }
      return typedArray;
    });

    vi.stubGlobal('crypto', {
      getRandomValues,
      subtle: crypto.subtle,
    });

    const id = randomUUIDv4();
    expect(getRandomValues).toHaveBeenCalledTimes(1);
    expect(typeof id).toBe('string');
    expect(id).toHaveLength(36);

    vi.unstubAllGlobals();
  });

  it('throws when no crypto is available', () => {
    vi.stubGlobal('crypto', undefined);
    expect(() => randomUUIDv4()).toThrow('No crypto available');
    vi.unstubAllGlobals();
  });
});
