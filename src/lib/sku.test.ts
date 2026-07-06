import { describe, it, expect, vi, afterEach } from 'vitest';
import { generateSku } from './sku';

afterEach(() => vi.restoreAllMocks());

describe('generateSku (PRJ-2253)', () => {
  it('produces the FAB-<YYMMDD>-<4> shape with an unambiguous suffix', () => {
    const code = generateSku(new Date(2026, 6, 6)); // 2026-07-06 (month is 0-based)
    expect(code).toMatch(/^FAB-260706-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/);
  });

  it('embeds the given date, zero-padded', () => {
    const code = generateSku(new Date(2026, 0, 3)); // 2026-01-03
    expect(code.startsWith('FAB-260103-')).toBe(true);
  });

  it('never uses ambiguous glyphs (0/O/1/I/L) in the suffix', () => {
    // Sample many suffixes; the code is meant to be read off a torn label.
    for (let i = 0; i < 200; i++) {
      const suffix = generateSku().split('-')[2];
      expect(suffix).not.toMatch(/[0O1IL]/);
    }
  });

  it('gives back-to-back items distinct codes (deterministic — distinct RNG → distinct suffix)', () => {
    // Drive the suffix off a counter instead of real entropy so the assertion
    // can never flake: encode n in base-<alphabet> across the bytes, giving a
    // unique suffix per call for n well under 31^4. Proves the suffix tracks
    // the RNG output — the property that makes back-to-back codes distinct.
    let n = 0;
    vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation((arr) => {
      const view = arr as Uint8Array;
      let v = n++;
      for (let i = 0; i < view.length; i++) { view[i] = v % 31; v = Math.floor(v / 31); }
      return arr;
    });
    const codes = new Set(Array.from({ length: 50 }, () => generateSku(new Date(2026, 6, 6))));
    expect(codes.size).toBe(50);
  });
});
