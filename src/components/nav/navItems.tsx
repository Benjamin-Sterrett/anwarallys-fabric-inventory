// Shared nav-item definitions + presentational pieces for the branded nav.
//
// Single source of truth: `NAV_ITEMS` is rendered by BOTH the desktop
// `Sidebar` and the mobile `Drawer` via `<NavList>`, so the two layouts can
// never drift. Icons are inline SVG (no icon dependency).
//
// Active state (AC: distinguishable WITHOUT relying on color — the owner is
// colorblind): the active row gets a left accent bar + `font-semibold` +
// `bg-brand-tint` + `text-brand-dark`, and NavLink auto-sets
// `aria-current="page"`. Multiple non-color cues (weight, background shape,
// left bar, ARIA) satisfy the requirement.

import { NavLink } from 'react-router-dom';
import type { ReactNode } from 'react';
import BrandWordmark from '../BrandWordmark';

export interface NavItem {
  label: string;
  to: string;
  /** Exact-match active state (used for Home `/`). */
  end?: boolean;
  /** Only render for the admin (isAdminEmail && emailVerified). */
  adminOnly?: boolean;
  /** Show the live low-stock count badge on this item. */
  lowStockBadge?: boolean;
  icon: ReactNode;
}

// ── Inline SVG icons (decoration only — labels carry the meaning) ──────────
const iconProps = {
  className: 'h-5 w-5 shrink-0',
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

const HomeIcon = (
  <svg {...iconProps}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V21h14V9.5" />
    <path d="M9.5 21v-6h5v6" />
  </svg>
);

const FindIcon = (
  <svg {...iconProps}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);

const LowStockIcon = (
  <svg {...iconProps}>
    <path d="M12 3 2.5 20h19L12 3Z" />
    <path d="M12 10v4" />
    <path d="M12 17.5v.01" />
  </svg>
);

const StaffIcon = (
  <svg {...iconProps}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
    <path d="M16 5.2a3.2 3.2 0 0 1 0 5.9" />
    <path d="M17.5 14.5a5.5 5.5 0 0 1 3 5.5" />
  </svg>
);

const KeyIcon = (
  <svg {...iconProps}>
    <circle cx="8" cy="15" r="4" />
    <path d="m11 12 9-9" />
    <path d="m17 6 2 2" />
    <path d="m14 9 2 2" />
  </svg>
);

const TrashIcon = (
  <svg {...iconProps}>
    <path d="M4 7h16" />
    <path d="M9 7V4h6v3" />
    <path d="M6 7l1 13h10l1-13" />
  </svg>
);

// Order is intentional. Home is first + explicit (owner call); the wordmark
// also links home. Staff is admin-only.
export const NAV_ITEMS: NavItem[] = [
  { label: 'Home', to: '/', end: true, icon: HomeIcon },
  { label: 'Find', to: '/find', icon: FindIcon },
  { label: 'Low stock', to: '/lowstock', lowStockBadge: true, icon: LowStockIcon },
  { label: 'Staff', to: '/staff', adminOnly: true, icon: StaffIcon },
  { label: 'Change password', to: '/change-password', icon: KeyIcon },
  { label: 'Recently deleted', to: '/deleted', icon: TrashIcon },
];

// ── Red count pill (reused by NavList rows + the TopBar quick indicator) ───
export function LowStockCountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-xs font-bold text-white">
      {count}
    </span>
  );
}

interface NavListProps {
  lowStockCount: number;
  isAdmin: boolean;
  /** Called after an item is tapped (used by the Drawer to close itself). */
  onNavigate?: () => void;
}

// The shared vertical nav list. `bg-brand-tint`/accent-bar/weight together
// mark the active row without relying on color alone.
export function NavList({ lowStockCount, isAdmin, onNavigate }: NavListProps) {
  const items = NAV_ITEMS.filter((it) => !it.adminOnly || isAdmin);
  return (
    <nav aria-label="Main" className="flex flex-col gap-1">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            [
              'relative flex min-h-12 items-center gap-3 rounded-md py-2 pl-4 pr-3 text-sm',
              isActive
                ? 'bg-brand-tint font-semibold text-brand-dark'
                : 'font-medium text-gray-700 hover:bg-gray-100',
            ].join(' ')
          }
        >
          {({ isActive }) => (
            <>
              <span
                aria-hidden="true"
                className={[
                  'absolute inset-y-1 left-0 w-1 rounded-full',
                  isActive ? 'bg-brand' : 'bg-transparent',
                ].join(' ')}
              />
              {item.icon}
              <span className="flex-1 truncate">{item.label}</span>
              {item.lowStockBadge ? <LowStockCountBadge count={lowStockCount} /> : null}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

// Shared brand header for the Sidebar + Drawer: the white wordmark (→ home)
// over the "Signed in as {label}" line, on the brand-green block. `children`
// is an optional trailing action (the Drawer's Close button).
export function NavBrandHeader({
  label,
  children,
}: {
  label: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-start gap-2 bg-brand px-4 py-4">
      <div className="min-w-0 flex-1">
        <BrandWordmark variant="white" className="text-2xl" />
        <p className="mt-2 truncate text-sm text-white/90">
          Signed in as <span className="font-semibold text-white">{label}</span>
        </p>
      </div>
      {children}
    </div>
  );
}

interface SignOutButtonProps {
  onSignOut: () => void;
  busy: boolean;
  error?: string | null;
}

// Shared sign-out action (NOT a link) — window.confirm gate + busy state live
// in AppNav; this is just the trigger + inline error, reused by Sidebar +
// Drawer.
export function SignOutButton({ onSignOut, busy, error }: SignOutButtonProps) {
  return (
    <>
      <button
        type="button"
        onClick={onSignOut}
        disabled={busy}
        className="inline-flex min-h-12 w-full items-center justify-center rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-800 disabled:opacity-50"
      >
        {busy ? 'Signing out…' : 'Sign out'}
      </button>
      {error ? (
        <p className="mt-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}
