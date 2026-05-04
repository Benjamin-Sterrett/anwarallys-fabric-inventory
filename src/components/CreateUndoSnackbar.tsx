import { useCallback, useEffect, useState } from 'react';
import { softDeleteItem } from '@/lib/queries';

const CREATE_UNDO_SNACKBAR_MS = 15_000;
const REMOVED_TOAST_MS = 4_000;

type Phase = 'active' | 'undoing' | 'removed' | 'error';

interface CreateUndoSnackbarProps {
  itemId: string;
  actorUid: string;
  onDismiss: () => void;
}

export default function CreateUndoSnackbar({ itemId, actorUid, onDismiss }: CreateUndoSnackbarProps) {
  const [phase, setPhase] = useState<Phase>('active');

  // 15-sec auto-dismiss from mount (active + error phases).
  useEffect(() => {
    if (phase === 'removed') return;
    const t = window.setTimeout(() => { onDismiss(); }, CREATE_UNDO_SNACKBAR_MS);
    return () => window.clearTimeout(t);
  }, [phase, onDismiss]);

  // 4-sec auto-dismiss for the "Removed." toast.
  useEffect(() => {
    if (phase !== 'removed') return;
    const t = window.setTimeout(() => { onDismiss(); }, REMOVED_TOAST_MS);
    return () => window.clearTimeout(t);
  }, [phase, onDismiss]);

  const handleUndo = useCallback(async () => {
    if (phase !== 'active') return;
    setPhase('undoing');
    const r = await softDeleteItem(itemId, 'created-by-mistake', actorUid);
    if (r.ok) {
      setPhase('removed');
    } else {
      setPhase('error');
    }
  }, [itemId, actorUid, phase]);

  const text = phase === 'active' ? 'Item created.'
    : phase === 'undoing' ? 'Undoing…'
    : phase === 'removed' ? 'Removed.'
    : 'Could not undo. Try deleting from the item page.';

  const showUndo = phase === 'active' || phase === 'undoing';

  return (
    <div className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 transform" role="status">
      <div className="flex items-center gap-3 rounded-md bg-gray-900 px-4 py-2 text-sm text-white shadow-lg">
        <span>{text}</span>
        {showUndo ? (
          <button
            type="button"
            onClick={() => { void handleUndo(); }}
            disabled={phase === 'undoing'}
            className="rounded border border-white/30 px-2 py-0.5 text-xs"
          >
            {phase === 'undoing' ? 'Undoing…' : 'Undo'}
          </button>
        ) : null}
      </div>
    </div>
  );
}
