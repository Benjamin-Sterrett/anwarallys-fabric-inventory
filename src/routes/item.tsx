import { useParams } from 'react-router-dom';
import ComingSoon from './ComingSoon';

// QR-landing route. MUST remain read-only in production per synthesis §4.1 —
// explicit "Adjust stock" button enters the mutation workflow. PRJ-794.
export default function ItemRoute() {
  const { itemId } = useParams<{ itemId: string }>();
  return (
    <ComingSoon
      title={`Item ${itemId ?? '?'}`}
      detail="Scanned QR lands here (read-only). Adjust-stock button comes later."
      ticket="PRJ-794"
    />
  );
}
