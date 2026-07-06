// Client-side image downscaling for item photos (PRJ-2255).
//
// Product decision (owner, 2026-07-06): store photos INLINE as a downscaled
// data-URI in the existing `photoUrl` field — no Firebase Storage, no billing,
// no new collection, no Firestore Rules change. To keep those inline images
// from bloating item reads (the app is onSnapshot-driven and runs on flaky
// shop Wi-Fi), we downscale hard before storing: a fabric-roll photo only needs
// to be recognisable, not print-quality.
//
// A Firestore document is capped at ~1 MB. `MAX_BYTES` keeps a single photo far
// under that with headroom for the rest of the item doc; `downscaleImage`
// re-encodes at descending quality until it fits, and rejects if it still
// can't (rather than silently storing an over-limit string the write would
// reject).

/**
 * The exact data-URI prefix this module emits (canvas → JPEG). The item form
 * allows an inline data: photo ONLY when it starts with this — any other data:
 * URI (notably data:image/svg+xml, which can carry active content) is rejected
 * at save, so a pasted URI can't become stored XSS.
 */
export const JPEG_DATA_URL_PREFIX = 'data:image/jpeg;base64,';
/** Longest edge of the stored thumbnail, in CSS pixels. */
export const MAX_DIMENSION = 1024;
/** Hard ceiling on the encoded data-URI length (~180 KB of base64). */
export const MAX_BYTES = 180_000;
/** Quality ladder tried in order until the encoded size fits MAX_BYTES. */
const QUALITY_LADDER = [0.7, 0.55, 0.4, 0.3];

export type DownscaleResult =
  | { ok: true; dataUrl: string }
  | { ok: false; error: string };

/** Fit (w, h) inside a MAX_DIMENSION box, preserving aspect ratio. Never upscales. */
function fitWithin(w: number, h: number, max: number): { w: number; h: number } {
  const longest = Math.max(w, h);
  if (longest <= max) return { w, h };
  const scale = max / longest;
  return { w: Math.round(w * scale), h: Math.round(h * scale) };
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('That file could not be read as an image.'));
    img.src = dataUrl;
  });
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('That file could not be read.'));
    reader.readAsDataURL(file);
  });
}

/**
 * Downscale + re-encode an image file to a JPEG data URI small enough to store
 * inline in Firestore. Returns a discriminated result rather than throwing so
 * callers can surface a friendly message. Rejects non-images and files that
 * cannot be compressed under MAX_BYTES.
 */
export async function downscaleImage(file: File): Promise<DownscaleResult> {
  if (!file.type.startsWith('image/')) {
    return { ok: false, error: 'Please choose an image file.' };
  }
  let img: HTMLImageElement;
  try {
    img = await loadImage(await readAsDataUrl(file));
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not read the image.' };
  }

  const { w, h } = fitWithin(img.naturalWidth || img.width, img.naturalHeight || img.height, MAX_DIMENSION);
  if (w === 0 || h === 0) return { ok: false, error: 'That image appears to be empty.' };

  // Canvas draw/encode can throw (e.g. a tainted canvas or encoder failure).
  // Catch so downscaleImage always honours its Result contract — callers rely
  // on ok:false rather than a rejected promise for a friendly message.
  try {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return { ok: false, error: 'Your browser could not process the image.' };
    // White matte so transparent PNGs don't turn black when flattened to JPEG.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);

    for (const quality of QUALITY_LADDER) {
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      if (dataUrl.length <= MAX_BYTES) return { ok: true, dataUrl };
    }
    return { ok: false, error: 'That photo is too large even after shrinking. Try a smaller image.' };
  } catch {
    return { ok: false, error: 'Your browser could not process the image.' };
  }
}
