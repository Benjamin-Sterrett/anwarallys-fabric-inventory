// UUID v4 generator with `crypto.randomUUID()` fast path and a
// hand-rolled fallback for environments where `crypto.randomUUID`
// is unavailable (Safari <15.4, older Android WebViews). The
// fallback is RFC 4122 compliant: bytes 6 and 8 are masked with
// the version (4) and variant (RFC 4122) bits.
//
// Why this matters: PRJ-883 uses the UUID as a per-save correlation
// id. Throwing on unsupported runtimes would block stock adjustments
// entirely on older devices. Older Android tablets are explicitly
// in the pilot environment — see client_answers memory.
//
// Compatibility surface (intentional ES5-friendly fallback):
//   - `window.crypto` (universally available since IE 11 / Android 4.4)
//   - `Uint8Array` (ES2015 baseline; pre-dates `crypto.getRandomValues`)
//   - `crypto.getRandomValues` (paired with `Uint8Array`)
//   - `for` loop and manual hex string concatenation — no `Array.from`,
//     no `String.prototype.padStart`, no `globalThis`.

export function randomUUIDv4(): string {
  // Prefer `window.crypto` over `globalThis.crypto`: `window` is
  // available on every browser runtime where this code can run;
  // `globalThis` is ES2020 and may be absent on pre-2018 runtimes.
  const c: Crypto | undefined = (typeof window !== 'undefined' ? window.crypto : undefined);
  if (!c) {
    throw new Error('No crypto available — cannot generate UUID.');
  }
  if (typeof c.randomUUID === 'function') {
    return c.randomUUID();
  }
  // Hand-rolled fallback. ES5-safe: no Array.from, no padStart, no
  // globalThis, no template literals would also be possible but TS
  // strict-mode prefers them — they compile to ES5 string concat.
  const bytes = new Uint8Array(16);
  c.getRandomValues(bytes);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // variant (10xx)
  let hex = '';
  for (let i = 0; i < 16; i += 1) {
    const b = bytes[i]!;
    // Manual hex pad: b.toString(16) returns 1-or-2 chars; prefix '0'
    // for single-char values to ensure 2-char alignment.
    hex += (b < 0x10 ? '0' : '') + b.toString(16);
  }
  return (
    hex.slice(0, 8) + '-' +
    hex.slice(8, 12) + '-' +
    hex.slice(12, 16) + '-' +
    hex.slice(16, 20) + '-' +
    hex.slice(20, 32)
  );
}
