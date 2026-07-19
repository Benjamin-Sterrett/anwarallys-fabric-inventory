// Slim brand-green top bar for phone/tablet (staff). Below `lg` only; the
// desktop Sidebar replaces it at `lg+`.
//
// Renders in a real <header> so the existing print rule
// (`body.label-print-mode header { display:none }`) hides it when printing.
// Layout: `☰` (opens the Drawer) + white wordmark (→ home) + a low-stock quick
// link with the live count badge.

import { forwardRef } from 'react';
import { Link } from 'react-router-dom';
import BrandWordmark from '../BrandWordmark';
import { LowStockCountBadge, NAV_ITEMS } from './navItems';

interface TopBarProps {
  lowStockCount: number;
  onOpenMenu: () => void;
  drawerOpen: boolean;
}

const lowStockIcon = NAV_ITEMS.find((i) => i.lowStockBadge)?.icon;

// forwardRef so AppNav can return focus to the hamburger when the Drawer closes.
const TopBar = forwardRef<HTMLButtonElement, TopBarProps>(function TopBar(
  { lowStockCount, onOpenMenu, drawerOpen },
  ref,
) {
  return (
    <header className="flex items-center gap-2 bg-brand px-3 py-2 lg:hidden">
      <button
        ref={ref}
        type="button"
        onClick={onOpenMenu}
        aria-label="Menu"
        aria-haspopup="dialog"
        aria-expanded={drawerOpen}
        aria-controls="app-drawer"
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
          <path d="M4 6h16" />
          <path d="M4 12h16" />
          <path d="M4 18h16" />
        </svg>
      </button>

      <BrandWordmark variant="white" className="text-xl" />

      <Link
        to="/lowstock"
        aria-label={
          lowStockCount > 0
            ? `Low stock: ${lowStockCount} item${lowStockCount === 1 ? '' : 's'}`
            : 'Low stock'
        }
        className="ml-auto inline-flex min-h-12 min-w-12 items-center justify-center gap-1 rounded-md px-2 text-white hover:bg-white/10"
      >
        <span aria-hidden="true">{lowStockIcon}</span>
        <LowStockCountBadge count={lowStockCount} />
      </Link>
    </header>
  );
});

export default TopBar;
