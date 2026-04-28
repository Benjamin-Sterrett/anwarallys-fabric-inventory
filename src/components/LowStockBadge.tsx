interface LowStockBadgeProps {
  remainingMeters: number;
  minimumMeters: number;
}

export default function LowStockBadge({ remainingMeters, minimumMeters }: LowStockBadgeProps) {
  if (remainingMeters > minimumMeters) return null;
  return (
    <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
      Low stock
    </span>
  );
}
