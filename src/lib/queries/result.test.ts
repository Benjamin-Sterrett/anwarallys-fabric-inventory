import { describe, it, expect } from 'vitest';
import { ok, err } from './result';

describe('Result helpers', () => {
  describe('ok()', () => {
    it('wraps a string value', () => {
      const r = ok('hello');
      expect(r).toEqual({ ok: true, data: 'hello' });
    });

    it('wraps an object value', () => {
      const payload = { id: 'roll-1', meters: 42 };
      const r = ok(payload);
      expect(r).toEqual({ ok: true, data: payload });
    });

    it('wraps null', () => {
      const r = ok(null);
      expect(r).toEqual({ ok: true, data: null });
    });
  });

  describe('err()', () => {
    it('returns a structured error', () => {
      const r = err('NOT_FOUND', 'Item does not exist');
      expect(r).toEqual({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Item does not exist' },
      });
    });

    it('accepts empty message', () => {
      const r = err('UNKNOWN', '');
      expect(r).toEqual({
        ok: false,
        error: { code: 'UNKNOWN', message: '' },
      });
    });
  });
});
