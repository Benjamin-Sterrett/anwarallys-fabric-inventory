import { Component, useMemo, type ReactNode } from 'react';
import { QRCodeSVG } from 'qrcode.react';

export type RollLabelSize = 'default' | 'small';

interface RollLabelProps {
  itemId: string;
  size?: RollLabelSize;
}

const HOST = import.meta.env.VITE_PUBLIC_HOST as string | undefined;

if (import.meta.env.DEV) {
  if (!HOST) {
    // eslint-disable-next-line no-console
    console.warn('[RollLabel] VITE_PUBLIC_HOST is not set. QR codes will not render correctly.');
  } else if (HOST.length > 30) {
    // eslint-disable-next-line no-console
    console.warn(`[RollLabel] VITE_PUBLIC_HOST is too long (${HOST.length} chars). Use a short host for reliable QR scanning.`);
  }
}

const SIZE_STYLES: Record<RollLabelSize, React.CSSProperties> = {
  default: { width: '50mm', height: '50mm' },
  small: { width: '30mm', height: '30mm' },
};

function buildUrl(itemId: string): string | null {
  if (!HOST || HOST.trim() === '') {
    return null;
  }
  // Guard against accidental scheme inclusion in the env var
  const host = HOST.trim().replace(/^https?:\/\//, '');
  return `https://${host}/i/${encodeURIComponent(itemId)}`;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class QRCodeErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode; fallback: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  override render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

function QrErrorFallback({ size }: { size: RollLabelSize }) {
  return (
    <div
      className="flex items-center justify-center rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700"
      style={SIZE_STYLES[size]}
    >
      Could not generate QR code
    </div>
  );
}

/**
 * Permanent item QR code. URL contains the immutable Firestore auto-ID.
 * Editing non-ID fields does NOT regenerate the QR because the URL depends
 * only on `itemId` and `VITE_PUBLIC_HOST`.
 */
export default function RollLabel({ itemId, size = 'default' }: RollLabelProps) {
  const url = useMemo(() => buildUrl(itemId), [itemId]);

  if (!url) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700"
        style={SIZE_STYLES[size]}
      >
        QR host not configured — set VITE_PUBLIC_HOST
      </div>
    );
  }

  if (!itemId || itemId.trim() === '') {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 text-xs text-gray-500"
        style={SIZE_STYLES[size]}
      >
        No item ID
      </div>
    );
  }

  return (
    <QRCodeErrorBoundary fallback={<QrErrorFallback size={size} />}>
      <QRCodeSVG
        value={url}
        level="Q"
        marginSize={4}
        bgColor="#FFFFFF"
        fgColor="#000000"
        style={SIZE_STYLES[size]}
        title={`QR code for item ${itemId}`}
      />
    </QRCodeErrorBoundary>
  );
}
