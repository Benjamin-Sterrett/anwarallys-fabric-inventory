import { createBrowserRouter, Navigate, useParams } from 'react-router-dom';

import App from '../App';
import DashboardRoute from './index';
import LoginRoute from './login';
import ItemRoute from './item';
import ItemNewRoute, { ItemEditRoute } from './item-form';
import ItemDetailRoute from './item-detail';
import ItemAdjustRoute from './item-adjust';
import FolderRoute from './folder';
import DeletedRoute from './deleted';
import LowStockRoute from './lowstock';
import NotFoundRoute from './not-found';
import StaffRoute from './staff';
import PrintLabelRoute from './print-label';
import PrintLabelsRoute from './print-labels';
import ChangePasswordRoute from './change-password';
import { RequireAdmin, RequireAuth } from './RequireAuth';

function RollsAdjustRedirect() {
  const { id } = useParams();
  return <Navigate to={`/items/${id}/adjust`} replace />;
}

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
      { path: 'i/:itemId', element: <ItemRoute /> },
      { path: 'items/:id/adjust', element: <RequireAuth><ItemAdjustRoute /></RequireAuth> },
      { path: 'rolls/:id/adjust', element: <RollsAdjustRedirect /> },
      { path: 'folders/:id', element: <RequireAuth><FolderRoute /></RequireAuth> },
      // PRJ-784: item create + edit forms. Create is folder-scoped so the
      // form can derive `folderAncestors` from the parent folder doc.
      // Edit is item-scoped — the form keeps the item's existing folder.
      { path: 'folders/:folderId/items/new', element: <RequireAuth><ItemNewRoute /></RequireAuth> },
      // PRJ-789: item-detail page hosts Adjust entry, persistent Undo, and movement history.
      { path: 'items/:itemId', element: <RequireAuth><ItemDetailRoute /></RequireAuth> },
      { path: 'items/:itemId/edit', element: <RequireAuth><ItemEditRoute /></RequireAuth> },
      { path: 'deleted', element: <RequireAuth><DeletedRoute /></RequireAuth> },
      { path: 'lowstock', element: <RequireAuth><LowStockRoute /></RequireAuth> },
      { path: 'staff', element: <RequireAdmin><StaffRoute /></RequireAdmin> },
      { path: 'print/label/:itemId', element: <RequireAuth><PrintLabelRoute /></RequireAuth> },
      { path: 'print/labels', element: <RequireAuth><PrintLabelsRoute /></RequireAuth> },
      { path: 'change-password', element: <RequireAuth><ChangePasswordRoute /></RequireAuth> },
      { path: '*', element: <RequireAuth><NotFoundRoute /></RequireAuth> },
    ],
  },
]);
