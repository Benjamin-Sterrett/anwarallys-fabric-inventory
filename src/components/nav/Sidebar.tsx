// Persistent left sidebar for desktop web (Shaaiz). Always visible at `lg+`,
// hidden below (the TopBar + Drawer take over there).
//
// Carries `data-auth-bar` so the existing print rule
// (`body.label-print-mode [data-auth-bar] { display:none }`) still hides the
// nav when printing labels. `data-app-nav` is a stable hook for the same.

import { NavBrandHeader, NavList, SignOutButton } from './navItems';

interface SidebarProps {
  label: string;
  lowStockCount: number;
  isAdmin: boolean;
  onSignOut: () => void;
  signingOut: boolean;
  signOutError: string | null;
}

export default function Sidebar({
  label,
  lowStockCount,
  isAdmin,
  onSignOut,
  signingOut,
  signOutError,
}: SidebarProps) {
  return (
    <aside
      data-auth-bar
      data-app-nav
      aria-label="Sidebar"
      className="hidden w-64 shrink-0 flex-col border-r border-gray-200 bg-white lg:flex"
    >
      <NavBrandHeader label={label} />

      <div className="flex-1 overflow-y-auto p-3">
        <NavList lowStockCount={lowStockCount} isAdmin={isAdmin} />
      </div>

      <div className="border-t border-gray-200 p-3">
        <SignOutButton onSignOut={onSignOut} busy={signingOut} error={signOutError} />
      </div>
    </aside>
  );
}
