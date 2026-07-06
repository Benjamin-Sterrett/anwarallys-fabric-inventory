// Default item-code (SKU) generation for new items (PRJ-2253).
//
// `sku` is the human-readable "Item code" printed on each label and typed into
// the find-by-code page (PRJ-2252) when a QR sticker is torn. Staff previously
// had to invent a code for every item; this pre-fills a sensible, unique-ish
// default that stays fully editable (the field is not enforced-unique — there
// is no Firestore constraint, per the locked model).
//
// Format: `FAB-<YYMMDD>-<4>` e.g. `FAB-260706-K7P2`. The date prefix groups a
// day's items and reads naturally; the random suffix makes back-to-back codes
// distinct.
//
// Alphabet excludes 0/O/1/I/L — the code exists to be READ off a damaged label
// and re-typed, so ambiguous glyphs would defeat the purpose. 31^4 ≈ 924k
// suffixes per day is far beyond collision risk for a 2–3 person pilot.

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const SUFFIX_LEN = 4;

function randomSuffix(): string {
  const bytes = new Uint8Array(SUFFIX_LEN);
  crypto.getRandomValues(bytes);
  let out = '';
  // charAt (not []) so the index access is typed `string`, not `string | undefined`
  // under noUncheckedIndexedAccess — the modulo keeps it in range regardless.
  for (const b of bytes) {
    out += ALPHABET.charAt(b % ALPHABET.length);
  }
  return out;
}

/**
 * Generate a default item code for a new item. Editable by staff before save.
 * @param now injectable clock for deterministic tests; defaults to real time.
 */
export function generateSku(now: Date = new Date()): string {
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `FAB-${yy}${mm}${dd}-${randomSuffix()}`;
}
