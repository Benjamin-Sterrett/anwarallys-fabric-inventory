import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import LowStockBadge from './LowStockBadge';

describe('LowStockBadge', () => {
  it("renders 'Low stock' badge when remainingMeters equals minimumMeters", () => {
    render(<LowStockBadge remainingMeters={5} minimumMeters={5} />);
    expect(screen.queryByText('Low stock')).toBeInTheDocument();
  });

  it("renders 'Low stock' badge when remainingMeters is below minimumMeters", () => {
    render(<LowStockBadge remainingMeters={3} minimumMeters={5} />);
    expect(screen.queryByText('Low stock')).toBeInTheDocument();
  });

  it("renders nothing when remainingMeters is above minimumMeters", () => {
    render(<LowStockBadge remainingMeters={10} minimumMeters={5} />);
    expect(screen.queryByText('Low stock')).toBeNull();
  });

  it("renders 'Low stock' when both values are zero", () => {
    render(<LowStockBadge remainingMeters={0} minimumMeters={0} />);
    expect(screen.queryByText('Low stock')).toBeInTheDocument();
  });

  it("renders nothing when minimumMeters is zero and remainingMeters is positive", () => {
    render(<LowStockBadge remainingMeters={1} minimumMeters={0} />);
    expect(screen.queryByText('Low stock')).toBeNull();
  });
});
