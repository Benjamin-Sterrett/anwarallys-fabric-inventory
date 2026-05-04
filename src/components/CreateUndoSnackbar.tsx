import { useCallback, useRef, useState } from 'react';
import { softDeleteItem } from '@/lib/queries';
import { CREATE_UNDO_WINDOW_MS } from '@/lib/constants';
import UndoSnackbar from './UndoSnackbar';

type Phase = 'active' | 'undoing' | 'success' | 'error';

interface CreateUndoSnackbarProps {
  itemId: string;
  actorUid: string;
  onDismiss: () => void;
}

const REMOVED_TOAST_MS = 4_000;

export default function CreateUndoSnackbar({ itemId, actorUid, onDismiss }: CreateUndoSnackbarProps) {
  const [phase, setPhase] = useState<Phase>('active');
  const undoInflightRef = useRef(false);

  const handleUndo = useCallback(async () => {
    if (phase !== 'active') return;
    if (undoInflightRef.current) return;
    undoInflightRef.current = true;
    setPhase('undoing');
    try {
      const r = await softDeleteItem(itemId, 'created-by-mistake', actorUid);
      if (r.ok) {
        setPhase('success');
      } else {
        setPhase('error');
      }
    } finally {
      undoInflightRef.current = false;
    }
  }, [itemId, actorUid, phase]);

  return (
    <UndoSnackbar
      text="Item created."
      phase={phase}
      onDismiss={onDismiss}
      dismissMs={phase === 'success' ? REMOVED_TOAST_MS : CREATE_UNDO_WINDOW_MS}
      onUndo={handleUndo}
      successText="Removed."
      successLink={{ to: '/deleted', label: 'View deleted items' }}
      errorText="Could not undo. Try deleting from the item page."
    />
  );
}
