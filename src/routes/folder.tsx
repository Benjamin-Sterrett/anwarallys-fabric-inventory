import { useParams } from 'react-router-dom';
import ComingSoon from './ComingSoon';

export default function FolderRoute() {
  const { id } = useParams<{ id: string }>();
  return (
    <ComingSoon
      title={`Folder ${id ?? '?'}`}
      detail="Folder browse with breadcrumb + drill-down."
      ticket="PRJ-783"
    />
  );
}
