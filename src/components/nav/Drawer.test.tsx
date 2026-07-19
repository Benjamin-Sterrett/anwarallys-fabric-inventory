import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Drawer from './Drawer';

function renderDrawer(overrides?: Partial<React.ComponentProps<typeof Drawer>>) {
  const onClose = overrides?.onClose ?? vi.fn();
  const onSignOut = overrides?.onSignOut ?? vi.fn();
  const utils = render(
    <MemoryRouter>
      <Drawer
        open
        onClose={onClose}
        label="Aisha"
        lowStockCount={0}
        isAdmin={false}
        onSignOut={onSignOut}
        signingOut={false}
        signOutError={null}
        {...overrides}
      />
    </MemoryRouter>,
  );
  return { ...utils, onClose, onSignOut };
}

describe('Drawer', () => {
  it('renders nothing when closed', () => {
    render(
      <MemoryRouter>
        <Drawer
          open={false}
          onClose={vi.fn()}
          label="Aisha"
          lowStockCount={0}
          isAdmin={false}
          onSignOut={vi.fn()}
          signingOut={false}
          signOutError={null}
        />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('exposes the dialog with a modal label', () => {
    renderDrawer();
    const dialog = screen.getByRole('dialog', { name: 'Menu' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('id', 'app-drawer');
  });

  it('shows the signed-in label and a Close button', () => {
    renderDrawer();
    const dialog = within(screen.getByRole('dialog', { name: 'Menu' }));
    expect(dialog.getByText('Aisha')).toBeInTheDocument();
    expect(dialog.getByRole('button', { name: /close menu/i })).toBeInTheDocument();
  });

  it('calls onClose on Escape', () => {
    const { onClose } = renderDrawer();
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Menu' }), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('traps Tab focus — wraps last → first', () => {
    renderDrawer();
    const dialog = screen.getByRole('dialog', { name: 'Menu' });
    const focusables = dialog.querySelectorAll<HTMLElement>('a[href], button:not([disabled])');
    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;
    last.focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
  });

  it('traps Tab focus — wraps first → last on Shift+Tab', () => {
    renderDrawer();
    const dialog = screen.getByRole('dialog', { name: 'Menu' });
    const focusables = dialog.querySelectorAll<HTMLElement>('a[href], button:not([disabled])');
    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;
    first.focus();
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it('does not render Staff for a non-admin but renders it for an admin', () => {
    const { rerender } = renderDrawer({ isAdmin: false });
    expect(
      within(screen.getByRole('dialog', { name: 'Menu' })).queryByRole('link', { name: /staff/i }),
    ).not.toBeInTheDocument();
    rerender(
      <MemoryRouter>
        <Drawer
          open
          onClose={vi.fn()}
          label="Aisha"
          lowStockCount={0}
          isAdmin
          onSignOut={vi.fn()}
          signingOut={false}
          signOutError={null}
        />
      </MemoryRouter>,
    );
    expect(
      within(screen.getByRole('dialog', { name: 'Menu' })).getByRole('link', { name: /staff/i }),
    ).toBeInTheDocument();
  });
});
