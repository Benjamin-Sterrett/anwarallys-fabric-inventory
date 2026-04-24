import { useParams } from 'react-router-dom';
import ComingSoon from './ComingSoon';

export default function RollsAdjustRoute() {
  const { id } = useParams<{ id: string }>();
  return (
    <ComingSoon
      title={`Adjust roll ${id ?? '?'}`}
      detail="Stock adjustment workflow — hold-to-confirm, actor + reason required."
      ticket="PRJ-787"
    />
  );
}
