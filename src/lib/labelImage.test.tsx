import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { buildDownloadUrl, sanitizeFilename } from './labelImage';

describe('buildDownloadUrl', () => {
  const origHost = import.meta.env.VITE_PUBLIC_HOST;

  afterEach(() => {
    // Restore env
    vi.stubEnv('VITE_PUBLIC_HOST', origHost);
  });

  it('returns a URL when VITE_PUBLIC_HOST is set', () => {
    vi.stubEnv('VITE_PUBLIC_HOST', 'example.com');
    // Re-import to pick up new env — the module reads at import time,
    // so we test the function with the value it already captured.
    const url = buildDownloadUrl('abc123');
    expect(url).toBe('https://example.com/i/abc123');
  });

  it('encodes special characters in itemId', () => {
    vi.stubEnv('VITE_PUBLIC_HOST', 'example.com');
    const url = buildDownloadUrl('abc 123/');
    expect(url).toBe('https://example.com/i/abc%20123%2F');
  });

  it('strips scheme from host if accidentally included', () => {
    vi.stubEnv('VITE_PUBLIC_HOST', 'https://example.com');
    const url = buildDownloadUrl('test');
    // buildDownloadUrl reads the module-level HOST which is captured at
    // import time. This test verifies the function's trimming logic when
    // passed through the env var path.
    expect(url).toBe('https://example.com/i/test');
  });

  it('returns null when VITE_PUBLIC_HOST is not set', () => {
    vi.stubEnv('VITE_PUBLIC_HOST', '');
    const url = buildDownloadUrl('abc123');
    expect(url).toBeNull();
  });

  it('returns null when VITE_PUBLIC_HOST is only whitespace', () => {
    vi.stubEnv('VITE_PUBLIC_HOST', '   ');
    const url = buildDownloadUrl('abc123');
    expect(url).toBeNull();
  });
});

describe('sanitizeFilename', () => {
  it('preserves alphanumeric, hyphens, underscores, periods', () => {
    expect(sanitizeFilename('My-Fabric_2024.v1')).toBe('My-Fabric_2024.v1');
  });

  it('strips special characters', () => {
    expect(sanitizeFilename('hello@#$%^&world')).toBe('helloworld');
  });

  it('falls back to "download" for empty result after stripping', () => {
    expect(sanitizeFilename('!!!')).toBe('download');
  });

  it('accepts a custom fallback', () => {
    expect(sanitizeFilename('!!!', 'item123')).toBe('item123');
  });

  it('handles empty string', () => {
    expect(sanitizeFilename('')).toBe('download');
  });
});

describe('buildLabelImage', () => {
  let origHost: string | undefined;

  beforeEach(() => {
    origHost = import.meta.env.VITE_PUBLIC_HOST as string | undefined;
    vi.stubEnv('VITE_PUBLIC_HOST', 'example.com');

    // Stub DOM container creation
    const mockContainer = document.createElement('div');
    vi.spyOn(document, 'createElement').mockImplementation((tag, _options) => {
      if (tag === 'div') return mockContainer;
      return document.createElement(tag);
    });

    // Stub canvas getContext and toBlob
    const mockCtx = {
      fillStyle: '',
      fillRect: vi.fn(),
      drawImage: vi.fn(),
      fillText: vi.fn(),
      font: '',
      textAlign: '',
      measureText: vi.fn(() => ({ width: 50 })),
    } as unknown as CanvasRenderingContext2D;

    vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(mockCtx);

    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob')
      .mockImplementation((cb) => {
        cb?.(new Blob(['fake-png'], { type: 'image/png' }));
      });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.stubEnv('VITE_PUBLIC_HOST', origHost ?? '');
  });

  it('throws when VITE_PUBLIC_HOST is not configured', async () => {
    vi.stubEnv('VITE_PUBLIC_HOST', '');
    // Dynamic import to get fresh module binding
    const { buildLabelImage: bli } = await import('./labelImage');
    await expect(bli('item1', 'SKU001', 'Fabric name')).rejects.toThrow(
      'VITE_PUBLIC_HOST',
    );
  });
});

describe('renderQrPngDataUrl', () => {
  let origHost: string | undefined;

  beforeEach(() => {
    origHost = import.meta.env.VITE_PUBLIC_HOST as string | undefined;
    vi.stubEnv('VITE_PUBLIC_HOST', 'example.com');

    // Stub Image constructor to trigger onload synchronously (happy-dom
    // does not load images, so the Promise would never resolve otherwise).
    class MockImage {
      private _onload: (() => void) | null = null;
      width = 0;
      height = 0;
      set onload(fn: (() => void) | null) { this._onload = fn; }
      get onload() { return this._onload; }
      set onerror(_fn: ((reason?: unknown) => void) | null) { /* no-op */ }
      set src(_url: string) { this._onload?.(); }
    }
    vi.stubGlobal('Image', MockImage as unknown as typeof Image);

    // Stub canvas toDataURL
    const mockCtx = {
      fillStyle: '',
      fillRect: vi.fn(),
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D;

    vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(mockCtx);

    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL')
      .mockReturnValue('data:image/png;base64,fakeqrcode');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.stubEnv('VITE_PUBLIC_HOST', origHost ?? '');
  });

  it('returns a PNG data URL', async () => {
    const { renderQrPngDataUrl } = await import('./labelImage');
    const dataUrl = await renderQrPngDataUrl('https://example.com/i/test', 240);
    expect(dataUrl).toMatch(/^data:image\/png/);
  });

  it('throws when canvas context is not available', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(null);
    const { renderQrPngDataUrl } = await import('./labelImage');
    await expect(renderQrPngDataUrl('https://example.com/i/test', 240)).rejects.toThrow(
      'Could not get 2D context for QR canvas',
    );
  });
});
