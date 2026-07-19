/**
 * QR label image generation for download.
 *
 * Uses QRCodeSVG from the existing qrcode.react dependency via
 * renderToStaticMarkup (synchronous — no timing race with React effects),
 * then loads the SVG markup as an Image and composites it with SKU and
 * name text on a final canvas for PNG export.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { QRCodeSVG } from 'qrcode.react';

/** Pixel dimensions for the QR area on the final label. */
const QR_SIZE = 240;

/** Pixel dimensions for the final composite label image. */
const LABEL_WIDTH = 300;
const LABEL_HEIGHT = 400;
const QR_X = (LABEL_WIDTH - QR_SIZE) / 2;
const QR_Y = 16;
const TEXT_X = LABEL_WIDTH / 2;
const TEXT_Y_SKU = QR_Y + QR_SIZE + 38;
const TEXT_Y_NAME = QR_Y + QR_SIZE + 58;

/** Get the configured public host, or null if not set. */
function getHost(): string | null {
  const host = import.meta.env.VITE_PUBLIC_HOST as string | undefined;
  if (!host || host.trim() === '') return null;
  return host.trim().replace(/^https?:\/\//, '');
}

/**
 * Build the full item URL for QR encoding.
 * Returns null when VITE_PUBLIC_HOST is missing or empty.
 */
export function buildDownloadUrl(itemId: string): string | null {
  const host = getHost();
  if (!host) return null;
  return `https://${host}/i/${encodeURIComponent(itemId)}`;
}

/**
 * Strip characters that are problematic in filenames.
 * Falls back to `fallback` if the result is empty after stripping.
 */
export function sanitizeFilename(name: string, fallback: string = 'download'): string {
  const safe = name.replace(/[^a-zA-Z0-9\-_.]/g, '');
  return safe || fallback;
}

/** XML namespace a standalone SVG document needs in order to decode as an image. */
const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Render the QR code to SVG markup and guarantee the root `<svg>` carries the
 * `xmlns` namespace declaration.
 *
 * qrcode.react's `QRCodeSVG` does NOT emit an `xmlns` attribute. When the markup
 * is wrapped in a `Blob({type:'image/svg+xml'})` and loaded via `new Image()`, a
 * browser refuses to decode a namespace-less standalone SVG document: the image
 * fires `onerror`, the QR -> canvas -> PNG/PDF pipeline aborts, and the label /
 * QR download silently produces nothing (PRJ-2960). Injecting the namespace makes
 * the document decodable. jsdom/happy-dom never actually decode SVG images, so
 * this defect is invisible to the Image mocks — hence the dedicated markup test.
 */
export function serializeQrSvgMarkup(value: string): string {
  const raw = renderToStaticMarkup(
    <QRCodeSVG
      value={value}
      level="Q"
      marginSize={4}
      bgColor="#FFFFFF"
      fgColor="#000000"
    />,
  );
  // Idempotent: if a future qrcode.react version emits its own xmlns, keep it.
  if (/<svg[^>]*\sxmlns=/i.test(raw)) return raw;
  return raw.replace(/<svg\b/, `<svg xmlns="${SVG_NS}"`);
}

/**
 * Generate the QR code SVG markup synchronously, load it into an
 * Image element, and return the loaded Image.
 */
function renderQRImage(value: string): Promise<HTMLImageElement> {
  const svgMarkup = serializeQrSvgMarkup(value);

  return new Promise((resolve, reject) => {
    const svgBlob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(svgUrl);
      img.width = QR_SIZE;
      img.height = QR_SIZE;
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(svgUrl);
      reject(new Error('Failed to decode QR SVG as image'));
    };
    img.src = svgUrl;
  });
}

/**
 * Render a QR code to a PNG data URL at the given pixel size.
 *
 * Exported as a shared helper so labelPdf.ts can reuse the QR→canvas→PNG
 * pipeline without duplicating it from buildLabelImage.
 *
 * @param url The URL to encode in the QR code.
 * @param sizePx Width and height of the output PNG in pixels (square).
 * @returns A data URL string (data:image/png;base64,...).
 */
export async function renderQrPngDataUrl(url: string, sizePx: number): Promise<string> {
  const svgMarkup = serializeQrSvgMarkup(url);

  const svgBlob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' });
  const svgUrl = URL.createObjectURL(svgBlob);

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(svgUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(svgUrl);
      reject(new Error('Failed to decode QR SVG as image'));
    };
    image.src = svgUrl;
  });

  const canvas = document.createElement('canvas');
  canvas.width = sizePx;
  canvas.height = sizePx;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D context for QR canvas');

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, sizePx, sizePx);
  ctx.drawImage(img, 0, 0, sizePx, sizePx);

  return canvas.toDataURL('image/png');
}

/**
 * Compose the final label image: white background, QR code centered at top,
 * SKU (bold) beneath it, then name (regular) beneath that.
 */
function composeLabelCanvas(
  qrImage: HTMLImageElement,
  sku?: string,
  name?: string,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = LABEL_WIDTH;
  canvas.height = LABEL_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D context for label canvas');

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, LABEL_WIDTH, LABEL_HEIGHT);
  ctx.drawImage(qrImage, QR_X, QR_Y, QR_SIZE, QR_SIZE);
  ctx.textAlign = 'center';

  if (sku) {
    ctx.font = 'bold 18px sans-serif';
    ctx.fillStyle = '#000000';
    ctx.fillText(sku, TEXT_X, TEXT_Y_SKU);
  }

  if (name) {
    ctx.font = '14px sans-serif';
    ctx.fillStyle = '#000000';
    const maxWidth = LABEL_WIDTH - 40;
    const lines = wrapText(ctx, name, maxWidth);
    let lineY = TEXT_Y_NAME;
    for (const line of lines) {
      ctx.fillText(line, TEXT_X, lineY);
      lineY += 18;
    }
  }

  return canvas;
}

/**
 * Word-wrap text to fit within a pixel width.
 * Handles newlines by splitting on them first, then wrapping each
 * segment on spaces. Lines exceeding maxWidth are rendered as-is
 * (they will clip at the canvas boundary).
 */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  // Split on newlines first
  const segments = text.split('\n');
  const lines: string[] = [];
  for (const segment of segments) {
    if (!segment) {
      lines.push('');
      continue;
    }
    if (ctx.measureText(segment).width <= maxWidth) {
      lines.push(segment);
      continue;
    }
    const words = segment.split(' ');
    let current = '';
    for (const word of words) {
      if (!word) continue;
      const test = current ? `${current} ${word}` : word;
      if (ctx.measureText(test).width <= maxWidth) {
        current = test;
      } else {
        if (current) lines.push(current);
        // Oversized word — push as-is (will clip at canvas edge)
        if (ctx.measureText(word).width > maxWidth) {
          lines.push(word);
          current = '';
        } else {
          current = word;
        }
      }
    }
    if (current) lines.push(current);
  }
  return lines.length > 0 ? lines : [text];
}

/**
 * Generate a downloadable PNG Blob containing the QR label for an item.
 *
 * The image mirrors the printable RollLabel layout: QR code at top, SKU
 * (bold, 18px) beneath, then item name (regular, 14px) word-wrapped below.
 *
 * @throws If VITE_PUBLIC_HOST is not configured or image generation fails.
 */
export async function buildLabelImage(
  itemId: string,
  sku?: string,
  name?: string,
): Promise<Blob> {
  const url = buildDownloadUrl(itemId);
  if (!url) throw new Error('VITE_PUBLIC_HOST is not configured');

  const qrImage = await renderQRImage(url);
  const finalCanvas = composeLabelCanvas(qrImage, sku, name);

  const blob = await new Promise<Blob>((resolve, reject) => {
    finalCanvas.toBlob((b) => {
      if (b) resolve(b);
      else reject(new Error('canvas.toBlob returned null — PNG encoding failed'));
    }, 'image/png');
  });

  return blob;
}
