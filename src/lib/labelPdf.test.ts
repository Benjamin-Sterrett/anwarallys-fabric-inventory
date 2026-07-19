import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the labelImage module so renderQrPngDataUrl returns a fake data URL
// without needing the full canvas pipeline (not available in happy-dom).
vi.mock('./labelImage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./labelImage')>();
  return {
    ...actual,
    // Use a minimal valid 1x1 white PNG so jsPDF's addImage can decode it.
    renderQrPngDataUrl: vi.fn(() =>
      Promise.resolve('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='),
    ),
  };
});

describe('buildLabelPdf', () => {
  let origHost: string | undefined;

  beforeEach(() => {
    origHost = import.meta.env.VITE_PUBLIC_HOST as string | undefined;
    vi.stubEnv('VITE_PUBLIC_HOST', 'example.com');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.stubEnv('VITE_PUBLIC_HOST', origHost ?? '');
  });

  it('throws when VITE_PUBLIC_HOST is not configured', async () => {
    vi.stubEnv('VITE_PUBLIC_HOST', '');
    const { buildLabelPdf } = await import('./labelPdf');
    await expect(buildLabelPdf('item1', 'SKU001', 'Fabric name')).rejects.toThrow(
      'VITE_PUBLIC_HOST',
    );
  });

  it('produces a PDF Blob', async () => {
    const { buildLabelPdf } = await import('./labelPdf');
    const blob = await buildLabelPdf('item1', 'SKU001', 'Fabric name');
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('application/pdf');
  });

  it('produces a 150x100mm page (landscape)', async () => {
    const { buildLabelPdf } = await import('./labelPdf');
    const blob = await buildLabelPdf('item1', 'SKU001', 'Fabric name');
    const text = await blob.text();
    // jsPDF stores dimensions in points (1pt = 1/72in).
    // 150mm = 425.197pt; 100mm = 283.465pt.
    expect(text).toContain('/MediaBox [0 0 425.1968503937008563 283.4645669291338663]');
  });

  it('produces a PDF Blob without optional SKU and name', async () => {
    const { buildLabelPdf } = await import('./labelPdf');
    const blob = await buildLabelPdf('item1');
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('application/pdf');
  });
});
