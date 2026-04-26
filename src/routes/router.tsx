import { createBrowserRouter } from 'react-router-dom';

import App from '../App';
import DashboardRoute from './index';
import LoginRoute from './login';
import ItemRoute from './item';
import ItemNewRoute, { ItemEditRoute } from './item-form';
import RollsAdjustRoute from './rolls-adjust';
import FolderRoute from './folder';
import DeletedRoute from './deleted';
import LowStockRoute from './lowstock';
import NotFoundRoute from './not-found';
import StaffRoute from './staff';
import { RequireAdmin, RequireAuth } from './RequireAuth';

// Single source of truth for the route tree. Adding a route = add a line here.
// Paths mirror the URL scheme locked in research/synthesis.md §2 + §3.
//
// PRJ-781: every path EXCEPT /login is wrapped in <RequireAuth>. /staff
// is wrapped in <RequireAdmin>. Wrapping at this level keeps the route
// components themselves free of guard plumbing — the guard renders the
// LoadingShell while auth resolves, redirects to /login on null, and
// renders the route only after the user is verified.
//
// /i/:itemId (QR scan landing) IS wrapped: firestore.rules `match /items`
// requires `isActiveStaff()` to read, so an unauthenticated scan must
// land on /login first and round-trip back via the `continue` param.
export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <RequireAuth><DashboardRoute /></RequireAuth> },
      { path: 'login', element: <LoginRoute /> },
      { path: 'i/:itemId', element: <RequireAuth><ItemRoute /></RequireAuth> },
      { path: 'rolls/:id/adjust', element: <RequireAuth><RollsAdjustRoute /></RequireAuth> },
      { path: 'folders/:id', element: <RequireAuth><FolderRoute /></RequireAuth> },
      // PRJ-784: item create + edit forms. Create is folder-scoped so the
      // form can derive `folderAncestors` from the parent folder doc.
      // Edit is item-scoped — the form keeps the item's existing folder.
      { path: 'folders/:folderId/items/new', element: <RequireAuth><ItemNewRoute /></RequireAuth> },
      { path: 'items/:itemId/edit', element: <RequireAuth><ItemEditRoute /></RequireAuth> },
      { path: 'deleted', element: <RequireAuth><DeletedRoute /></RequireAuth> },
      { path: 'lowstock', element: <RequireAuth><LowStockRoute /></RequireAuth> },
      { path: 'staff', element: <RequireAdmin><StaffRoute /></RequireAdmin> },
      { path: '*', element: <RequireAuth><NotFoundRoute /></RequireAuth> },
    ],
  },
]);
