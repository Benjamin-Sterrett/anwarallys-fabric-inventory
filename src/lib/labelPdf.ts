/**
 * PDF label generation for download (PRJ-2943).
 *
 * Produces a 100x150mm landscape PDF suitable for label printers.
 * Layout: Anwarallys logo (brand green), QR code, SKU + item name on
 * the left half, vertical divider, and a blank right half for handwriting.
 *
 * jsPDF works natively in mm units so the physical dimensions are exact.
 */

import { jsPDF } from 'jspdf';
import { buildDownloadUrl, renderQrPngDataUrl, sanitizeFilename } from './labelImage';

/** Brand green used for the "Anwarallys" logo text. */
const BRAND_GREEN = '#1B7A4D';

/** Width of the QR code on the PDF in mm. */
const QR_MM = 42;

/** Pixel resolution used when rendering the QR data URL. */
const QR_PX = 240;

/**
 * Generate a downloadable PDF Blob containing the 100x150mm landscape
 * label for an item.
 *
 * The PDF layout matches Shaaiz's 2026-07-18 mockup:
 *   - "Anwarallys" logo (brand green Helvetica bold, ~20pt) at top-left
 *   - 42x42mm QR code centered horizontally on the left half
 *   - SKU (bold, ~13pt) centered on left half
 *   - Item name (~11pt) centered on left half
 *   - Vertical divider at x=75mm
 *   - Blank right half (handwriting area)
 *
 * @throws If VITE_PUBLIC_HOST is not configured or PDF generation fails.
 */
export async function buildLabelPdf(
  itemId: string,
  sku?: string,
  name?: string,
): Promise<Blob> {
  const url = buildDownloadUrl(itemId);
  if (!url) throw new Error('VITE_PUBLIC_HOST is not configured');

  // Render QR code to a PNG data URL for embedding in the PDF.
  const qrDataUrl = await renderQrPngDataUrl(url, QR_PX);

  // jsPDF: 150mm wide x 100mm tall, landscape orientation.
  // jsPDF's unit:mm + format:[150,100] guarantees exact physical dimensions.
  const doc = new jsPDF({ unit: 'mm', format: [150, 100], orientation: 'landscape' });

  // ── LEFT HALF (x 0..75mm) ──────────────────────────────────────────

  // Logo: "Anwarallys" in brand green Helvetica bold.
  // Pacifico font isn't embeddable in jsPDF without font-embedding;
  // use bold Helvetica in brand green for v1. Swapping in a vector
  // wordmark PNG is a future enhancement.
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(BRAND_GREEN);
  doc.text('Anwarallys', 6, 12);

  // QR code: 42x42mm PNG centered horizontally in the left half.
  // Left half centre x = 75/2 = 37.5mm; QR is 42mm wide, so left edge = 37.5 - 21 = 16.5mm.
  doc.addImage(qrDataUrl, 'PNG', 16.5, 26, QR_MM, QR_MM);

  // SKU: bold ~13pt, centred in the left half.
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor('#000000');
  if (sku) {
    // Wrap/scale so the SKU stays within the left half and never crosses
    // the divider at x=75mm. Split to a max 69mm width (3mm margin from
    // divider), then centre each line.
    const skuLines = doc.splitTextToSize(sku, 69);
    const skuY = 74;
    for (let i = 0; i < skuLines.length && i < 2; i++) {
      doc.text(skuLines[i], 75 / 2, skuY + i * 4, { align: 'center' });
    }
  }

  // Item name: ~11pt, centred in the left half.
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  if (name) {
    // Truncate/wrap so it never crosses x=72mm (3mm from divider).
    const maxWidth = 69;
    const lines = doc.splitTextToSize(name, maxWidth);
    // Start name text at y=82mm; each line ~4mm.
    const textY = 82;
    for (let i = 0; i < lines.length; i++) {
      doc.text(lines[i], 75 / 2, textY + i * 4, { align: 'center' });
      // Stop rendering if next line would overlap the divider area.
      if (i > 2) break;
    }
  }

  // ── DIVIDER ────────────────────────────────────────────────────────
  // Vertical line at x=75mm from y=8mm to y=92mm, 0.3mm, gray.
  doc.setDrawColor(153, 153, 153);
  doc.setLineWidth(0.3);
  doc.line(75, 8, 75, 92);

  // ── RIGHT HALF (x 75..150mm) ─────────────────────────────────────
  // Intentionally left blank (handwriting area). No border, no placeholder.

  // Export as blob
  const blob = doc.output('blob');
  return blob;
}

/**
 * Initiate a PDF label download for the given item.
 *
 * Creates a transient <a> element, triggers the download, then
 * cleans up. Designed to be called from a click handler.
 */
export function downloadLabelPdf(
  itemId: string,
  sku?: string,
  name?: string,
): Promise<void> {
  const filename = sanitizeFilename(sku ?? itemId, itemId) + '-label.pdf';
  return buildLabelPdf(itemId, sku, name).then((blob) => {
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  });
}
