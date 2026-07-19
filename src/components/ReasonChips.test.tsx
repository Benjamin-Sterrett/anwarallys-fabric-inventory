import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ReasonChips from './ReasonChips';

// Regression guard for PRJ-2940: the brand recolor must NOT collapse the
// colorblind-safe signal. Selected chips are distinguished by a FILL
// (bg-brand + white text); unselected chips by a BORDER — never by hue alone.
describe('ReasonChips brand active-state (colorblind-safe)', () => {
  it('selected chip uses the brand fill with white text', () => {
    render(<ReasonChips value="sold" onChange={vi.fn()} />);
    const selected = screen.getByRole('button', { name: 'Sold', pressed: true });
    expect(selected.className).toContain('bg-brand');
    expect(selected.className).toContain('text-white');
  });

  it('unselected chips carry a border (fill-vs-border cue), not the brand fill', () => {
    render(<ReasonChips value="sold" onChange={vi.fn()} />);
    const unselected = screen.getByRole('button', { name: 'Cut', pressed: false });
    expect(unselected.className).toContain('border');
    expect(unselected.className).not.toContain('bg-brand');
  });

  it('with no selection, no chip leaks the brand fill', () => {
    render(<ReasonChips value={null} onChange={vi.fn()} />);
    for (const btn of screen.getAllByRole('button')) {
      expect(btn.className).not.toContain('bg-brand');
      expect(btn.className).toContain('border');
    }
  });
});
