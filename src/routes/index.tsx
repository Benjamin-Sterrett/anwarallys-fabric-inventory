// `/` lands here. PRJ-783 makes Home the root folder browse — listing
// the top-level rooms and offering "New folder" to create one. The
// dashboard placeholder it replaced is retired; recent-movements list
// can land later as its own route (PRJ-799 owns that scope).
import { FolderBrowsePage } from './folder';

export default function DashboardRoute() {
  return <FolderBrowsePage parentId={null} />;
}
