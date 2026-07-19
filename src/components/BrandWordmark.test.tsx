import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import BrandWordmark from './BrandWordmark';

function renderWordmark() {
  return render(
    <MemoryRouter>
      <BrandWordmark />
    </MemoryRouter>,
  );
}

describe('BrandWordmark', () => {
  it('renders the "Anwarallys" wordmark text', () => {
    renderWordmark();
    expect(screen.getByText('Anwarallys')).toBeInTheDocument();
  });

  it('is a link to home', () => {
    renderWordmark();
    const link = screen.getByRole('link', { name: 'Anwarallys — home' });
    expect(link).toHaveAttribute('href', '/');
  });

  it('applies the Pacifico brand font and brand color tokens', () => {
    renderWordmark();
    const link = screen.getByRole('link', { name: 'Anwarallys — home' });
    expect(link.className).toContain('font-brand');
    expect(link.className).toContain('text-brand');
  });

  it('sizes responsively so it neither clips on phones nor looks lost on desktop', () => {
    renderWordmark();
    const link = screen.getByRole('link', { name: 'Anwarallys — home' });
    expect(link.className).toContain('text-xl');
    expect(link.className).toContain('sm:text-2xl');
  });
});
