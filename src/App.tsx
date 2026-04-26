import { Outlet, Link } from 'react-router-dom';
import AuthBar from './components/AuthBar';

// App shell. <AuthBar> renders below the brand header for every route;
// it self-hides when there is no signed-in user (the route guard handles
// redirects to /login). Future tickets add a global SyncStatusIndicator
// alongside it.
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
      <AuthBar />
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
