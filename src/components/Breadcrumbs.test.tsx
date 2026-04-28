import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Breadcrumbs, type BreadcrumbItem } from './Breadcrumbs';

function renderBreadcrumbs(items: BreadcrumbItem[]) {
  return render(
    <MemoryRouter>
      <Breadcrumbs items={items} />
    </MemoryRouter>,
  );
}

describe('Breadcrumbs', () => {
  it('renders all crumbs in order', () => {
    renderBreadcrumbs([
      { label: 'Home', to: '/' },
      { label: 'Room A', to: '/folders/abc' },
      { label: 'Cottons' },
    ]);

    const labels = screen.getAllByText(/Home|Room A|Cottons/);
    expect(labels[0]).toHaveTextContent('Home');
    expect(labels[1]).toHaveTextContent('Room A');
    expect(labels[2]).toHaveTextContent('Cottons');
  });

  it('last item is not a link', () => {
    renderBreadcrumbs([
      { label: 'Home', to: '/' },
      { label: 'Room A', to: '/folders/abc' },
      { label: 'Cottons' },
    ]);

    const cottons = screen.getByText('Cottons');
    expect(cottons.closest('a')).toBeNull();
  });

  it('non-last items are links with correct href', () => {
    renderBreadcrumbs([
      { label: 'Home', to: '/' },
      { label: 'Room A', to: '/folders/abc' },
      { label: 'Cottons' },
    ]);

    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Room A' })).toHaveAttribute('href', '/folders/abc');
  });

  it("non-last item without 'to' falls back to '/'", () => {
    renderBreadcrumbs([{ label: 'Home' }, { label: 'Last' }]);

    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
  });

  it('renders separators between items but not after last', () => {
    renderBreadcrumbs([
      { label: 'Home', to: '/' },
      { label: 'Room A', to: '/folders/abc' },
      { label: 'Cottons' },
    ]);

    const separators = screen.getAllByText('/');
    expect(separators).toHaveLength(2);
  });

  it('empty items array renders empty nav', () => {
    const { container } = renderBreadcrumbs([]);
    const nav = container.querySelector('nav');
    expect(nav).toBeInTheDocument();
    expect(nav).toBeEmptyDOMElement();
  });

  it('single item renders without separator', () => {
    renderBreadcrumbs([{ label: 'Home' }]);

    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.queryByText('/')).toBeNull();
  });

  it("nav has aria-label='Folder path'", () => {
    const { container } = renderBreadcrumbs([{ label: 'Home' }]);
    const nav = container.querySelector('nav');
    expect(nav).toHaveAttribute('aria-label', 'Folder path');
  });

  it('links have minimum 44px tap target', () => {
    renderBreadcrumbs([
      { label: 'Home', to: '/' },
      { label: 'Room A', to: '/folders/abc' },
      { label: 'Cottons' },
    ]);

    const links = screen.getAllByRole('link');
    expect(links.length).toBeGreaterThan(0);
    expect(links[0]!.className).toContain('min-h-[44px]');
  });
});
