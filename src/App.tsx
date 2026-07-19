import { Outlet } from 'react-router-dom';
import AppNav from './components/nav/AppNav';

// App shell. <AppNav> is the branded, responsive navigation: a persistent left
// Sidebar on desktop web (≥ lg) and a slim TopBar + slide-in Drawer on
// phone/tablet (< lg). It wraps the routed content so the Sidebar and content
// share one `lg:flex` row; when there is no signed-in user it renders only the
// (optional) deactivation banner and the routed page — the route guard handles
// redirects to /login.
export default function App() {
  return (
    <div className="flex min-h-full flex-col">
      <AppNav>
        <main className="flex-1">
          <Outlet />
        </main>
      </AppNav>
    </div>
  );
}
