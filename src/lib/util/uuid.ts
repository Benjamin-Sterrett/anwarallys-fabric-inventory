// UUID v4 generator with `crypto.randomUUID()` fast path and a
// `crypto.getRandomValues()` fallback for environments where
// `crypto.randomUUID` is unavailable (Safari <15.4, older Android
// WebViews). The fallback is RFC 4122 compliant: bytes 6 and 8 are
// masked with the version (4) and variant (RFC 4122) bits.
//
// Why this matters: PRJ-883 uses the UUID as a per-save correlation
// id. Throwing on unsupported runtimes would block stock adjustments
// entirely on older devices. The pilot environment is older Android
// tablets — see client_answers memory.

export function randomUUIDv4(): string {
  const c = (typeof globalThis !== 'undefined' ? globalThis.crypto : undefined);
  if (!c) {
    throw new Error('No crypto available — cannot generate UUID.');
  }
  if (typeof c.randomUUID === 'function') {
    return c.randomUUID();
  }
  // Fallback: use getRandomValues (universally supported in all browsers
  // since IE 11 / Android 4.4) and shape into RFC 4122 v4.
  const bytes = new Uint8Array(16);
  c.getRandomValues(bytes);
  // Non-null asserts: bytes is a freshly-allocated Uint8Array(16); indices
  // 6 and 8 are guaranteed in-range. Required for `noUncheckedIndexedAccess`.
  bytes[6] = (bytes[6]! & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // variant (10xx)
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
