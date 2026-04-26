// Reason chip selector — extracted from rolls-adjust.tsx (PRJ-788).
// Reusable across any surface that needs a MovementReason selection.

import { useCallback } from 'react';
import type { MovementReason } from '@/lib/models';

export const REASONS: ReadonlyArray<{ value: MovementReason; label: string }> = [
  { value: 'sold', label: 'Sold' },
  { value: 'cut', label: 'Cut' },
  { value: 'damage', label: 'Damage' },
  { value: 'return', label: 'Return' },
  { value: 'correction', label: 'Correction' },
  { value: 'receive', label: 'Receive' },
  { value: 'other', label: 'Other' },
];

/** Lookup a reason's display label. Falls back to the raw value. */
export function reasonLabel(reason: MovementReason): string {
  return REASONS.find((r) => r.value === reason)?.label ?? reason;
}

const BTN_BASE =
  'inline-flex min-h-12 min-w-12 items-center justify-center rounded-md px-5 py-3 text-sm font-medium disabled:opacity-50';

interface ReasonChipsProps {
  /** Currently selected reason, or null when none. */
  value: MovementReason | null;
  /** Called when the user taps a chip. */
  onChange: (reason: MovementReason) => void;
  /** Disable all chips (e.g. while submitting). */
  disabled?: boolean;
  /** Note value when reason === 'other'. */
  note?: string;
  /** Called when the note textarea changes. */
  onNoteChange?: (note: string) => void;
  /** Max note length. Default 200. */
  noteMaxLength?: number;
  /** Min note length when reason === 'other'. Default 3. */
  noteMinLength?: number;
}

export default function ReasonChips({
  value,
  onChange,
  disabled = false,
  note = '',
  onNoteChange,
  noteMaxLength = 200,
  noteMinLength = 3,
}: ReasonChipsProps) {
  const handleNoteChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onNoteChange?.(e.target.value.slice(0, noteMaxLength));
    },
    [onNoteChange, noteMaxLength]
  );

  return (
    <fieldset className="mb-4">
      <legend className="text-sm font-medium text-gray-800">Reason</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {REASONS.map((r) => {
          const selected = value === r.value;
          return (
            <button
              key={r.value}
              type="button"
              onClick={() => onChange(r.value)}
              aria-pressed={selected}
              disabled={disabled}
              className={`${BTN_BASE} ${selected ? 'bg-gray-900 text-white' : 'border border-gray-300 text-gray-800'} px-4 py-2`}
            >
              {r.label}
            </button>
          );
        })}
      </div>

      {value === 'other' && onNoteChange ? (
        <label className="mt-3 block">
          <span className="text-sm font-medium text-gray-800">Note (required)</span>
          <textarea
            value={note}
            onChange={handleNoteChange}
            disabled={disabled}
            rows={2}
            maxLength={noteMaxLength}
            placeholder="What happened?"
            className="mt-1 block w-full min-h-12 rounded-md border border-gray-300 px-3 py-2 text-base disabled:bg-gray-100 disabled:opacity-50"
          />
          <span className="mt-1 block text-xs text-gray-600">
            {note.trim().length}/{noteMaxLength} — at least {noteMinLength} characters.
          </span>
        </label>
      ) : null}
    </fieldset>
  );
}
