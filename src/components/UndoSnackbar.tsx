import { useEffect } from 'react';
import { Link } from 'react-router-dom';

type Phase = 'active' | 'undoing' | 'success' | 'error';

interface SuccessLink {
  to: string;
  label: string;
}

interface UndoSnackbarProps {
  text: string;
  phase: Phase;
  onDismiss: () => void;
  dismissMs: number;
  onUndo?: () => Promise<void> | void;
  successText?: string;
  successLink?: SuccessLink;
  errorText?: string;
}

export default function UndoSnackbar({
  text,
  phase,
  onDismiss,
  dismissMs,
  onUndo,
  successText,
  successLink,
  errorText,
}: UndoSnackbarProps) {
  const displayText = phase === 'success' && successText ? successText
    : phase === 'error' && errorText ? errorText
    : text;

  const showUndo = phase === 'active' || phase === 'undoing';
  const showClose = phase !== 'success';

  useEffect(() => {
    const t = window.setTimeout(() => { onDismiss(); }, dismissMs);
    return () => window.clearTimeout(t);
  }, [dismissMs, onDismiss]);

  return (
    <div className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 transform" role="status">
      <div className="flex items-center gap-3 rounded-md bg-gray-900 px-4 py-2 text-sm text-white shadow-lg">
        <span>{displayText}</span>
        {phase === 'success' && successLink ? (
          <Link
            to={successLink.to}
            className="text-xs underline underline-offset-2"
          >
            {successLink.label}
          </Link>
        ) : null}
        {showUndo && onUndo ? (
          <button
            type="button"
            onClick={() => { void onUndo(); }}
            disabled={phase === 'undoing'}
            className="rounded border border-white/30 px-2 py-0.5 text-xs"
          >
            {phase === 'undoing' ? 'Undoing…' : 'Undo'}
          </button>
        ) : null}
        {showClose ? (
          <button
            type="button"
            onClick={onDismiss}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded text-xs"
            aria-label="Dismiss"
          >
            ✕
          </button>
        ) : null}
      </div>
    </div>
  );
}
