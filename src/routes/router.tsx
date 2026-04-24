import { createBrowserRouter } from 'react-router-dom';

import App from '../App';
import DashboardRoute from './index';
import LoginRoute from './login';
import ItemRoute from './item';
import RollsAdjustRoute from './rolls-adjust';
import FolderRoute from './folder';
import DeletedRoute from './deleted';
import LowStockRoute from './lowstock';
import NotFoundRoute from './not-found';

// Single source of truth for the route tree. Adding a route = add a line here.
// Paths mirror the URL scheme locked in research/synthesis.md §2 + §3.
export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <DashboardRoute /> },
      { path: 'login', element: <LoginRoute /> },
      { path: 'i/:itemId', element: <ItemRoute /> },
      { path: 'rolls/:id/adjust', element: <RollsAdjustRoute /> },
      { path: 'folders/:id', element: <FolderRoute /> },
      { path: 'deleted', element: <DeletedRoute /> },
      { path: 'lowstock', element: <LowStockRoute /> },
      { path: '*', element: <NotFoundRoute /> },
    ],
  },
]);
