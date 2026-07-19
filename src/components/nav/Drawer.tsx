// Slide-in left drawer for phone/tablet (< lg). Opened by the TopBar `☰`.
//
// Accessibility: `role="dialog" aria-modal aria-label="Menu"`, focus moves in
// on open, a Tab focus-trap keeps focus inside, Esc closes, and focus returns
// to the `☰` button on close (AppNav owns that ref and the close handler).
// Also closes on overlay click, on any nav item tap (via NavList onNavigate),
// and on route change (AppNav effect). Slide/fade are CSS animations that the
// `prefers-reduced-motion` media query disables (see index.css).

import { useEffect, useRef } from 'react';
import { NavBrandHeader, NavList, SignOutButton } from './navItems';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  label: string;
  lowStockCount: number;
  isAdmin: boolean;
  onSignOut: () => void;
  signingOut: boolean;
  signOutError: string | null;
}

function getFocusable(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  );
}

export default function Drawer({
  open,
  onClose,
  label,
  lowStockCount,
  isAdmin,
  onSignOut,
  signingOut,
  signOutError,
}: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Move focus into the panel when it opens.
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    const focusables = getFocusable(panel);
    (focusables[0] ?? panel).focus();
  }, [open]);

  if (!open) return null;

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab') return;
    const panel = panelRef.current;
    if (!panel) return;
    const focusables = getFocusable(panel);
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (!first || !last) {
      e.preventDefault();
      return;
    }
    const active = document.activeElement;
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    // `data-app-drawer` is the print-hide hook: the `@media print
    // body.label-print-mode [data-app-drawer]` rule (src/styles/index.css)
    // hides this root — and thus BOTH the overlay and the panel it contains —
    // so an open drawer never overlays a label print.
    <div className="fixed inset-0 z-50 lg:hidden" data-app-drawer>
      <div
        className="drawer-overlay absolute inset-0 bg-black/50"
        aria-hidden="true"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        id="app-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="drawer-panel absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col bg-white shadow-xl outline-none"
      >
        <NavBrandHeader label={label}>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-md text-white hover:bg-white/10"
          >
            <svg
              className="h-6 w-6"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12" />
              <path d="M18 6 6 18" />
            </svg>
          </button>
        </NavBrandHeader>

        <div className="flex-1 overflow-y-auto p-3">
          <NavList lowStockCount={lowStockCount} isAdmin={isAdmin} onNavigate={onClose} />
        </div>

        <div className="border-t border-gray-200 p-3">
          <SignOutButton onSignOut={onSignOut} busy={signingOut} error={signOutError} />
        </div>
      </div>
    </div>
  );
}
