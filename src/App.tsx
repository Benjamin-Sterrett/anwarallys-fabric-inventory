import { Outlet, Link } from 'react-router-dom';

// App shell. In future tickets this will wrap Outlet in <AuthGate> and add
// the global SyncStatusIndicator. For the scaffold it's a thin layout.
export default function App() {
  return (
    <div className="min-h-full flex flex-col">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between">
          <Link to="/" className="text-lg font-semibold text-gray-900">
            Fabric Inventory
          </Link>
          <span className="text-xs text-gray-500">Scaffold build</span>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
