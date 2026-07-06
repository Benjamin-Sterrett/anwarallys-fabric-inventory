import { describe, it, expect, vi, afterEach } from 'vitest';
import { downscaleImage, MAX_BYTES } from './image';

function makeFile(type: string): File {
  return new File([new Uint8Array([1, 2, 3])], 'photo', { type });
}

// Stub the browser image pipeline (FileReader → Image → canvas) so the util is
// tested deterministically without happy-dom's partial canvas support.
function stubPipeline(toDataUrl: (q: number) => string, dims = { w: 2000, h: 1500 }) {
  class FR {
    result: string | null = null;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    readAsDataURL() { this.result = 'data:image/jpeg;base64,AAAA'; this.onload?.(); }
  }
  vi.stubGlobal('FileReader', FR as unknown as typeof FileReader);

  class Img {
    naturalWidth = dims.w; naturalHeight = dims.h; width = dims.w; height = dims.h;
    onload: (() => void) | null = null; onerror: (() => void) | null = null;
    set src(_v: string) { this.onload?.(); }
  }
  vi.stubGlobal('Image', Img as unknown as typeof Image);

  const ctx = { fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn() };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL')
    .mockImplementation(((_t?: string, q?: number) => toDataUrl(q ?? 0.7)) as typeof HTMLCanvasElement.prototype.toDataURL);
}

describe('downscaleImage (PRJ-2255)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('rejects a non-image file', async () => {
    const r = await downscaleImage(makeFile('application/pdf'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('Please choose an image file.');
  });

  it('returns a JPEG data URI when the encoded size fits', async () => {
    stubPipeline(() => 'data:image/jpeg;base64,' + 'A'.repeat(100));
    const r = await downscaleImage(makeFile('image/png'));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.dataUrl.startsWith('data:image/jpeg')).toBe(true);
  });

  it('drops quality until the encoded size is under the ceiling', async () => {
    // Highest quality overflows; lower qualities fit.
    stubPipeline((q) => q >= 0.7
      ? 'data:image/jpeg;base64,' + 'A'.repeat(MAX_BYTES + 1)
      : 'data:image/jpeg;base64,' + 'A'.repeat(50));
    const r = await downscaleImage(makeFile('image/jpeg'));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.dataUrl.length).toBeLessThanOrEqual(MAX_BYTES);
  });

  it('fails when even the lowest quality exceeds the ceiling', async () => {
    stubPipeline(() => 'data:image/jpeg;base64,' + 'A'.repeat(MAX_BYTES + 1));
    const r = await downscaleImage(makeFile('image/jpeg'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('too large');
  });

  it('returns a friendly error (never throws) when canvas encoding fails', async () => {
    stubPipeline(() => { throw new Error('tainted canvas'); });
    const r = await downscaleImage(makeFile('image/jpeg'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('could not process');
  });

  it('surfaces a friendly error when the image cannot be decoded', async () => {
    class FR {
      result: string | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      readAsDataURL() { this.result = 'data:image/jpeg;base64,AAAA'; this.onload?.(); }
    }
    vi.stubGlobal('FileReader', FR as unknown as typeof FileReader);
    class Img {
      onload: (() => void) | null = null; onerror: (() => void) | null = null;
      set src(_v: string) { this.onerror?.(); }
    }
    vi.stubGlobal('Image', Img as unknown as typeof Image);
    const r = await downscaleImage(makeFile('image/jpeg'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('could not be read');
  });
});
