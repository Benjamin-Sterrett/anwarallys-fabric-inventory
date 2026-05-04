import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import UndoSnackbar from './UndoSnackbar';

const DISMISS_MS = 5_000;

function renderWithRouter(props: React.ComponentProps<typeof UndoSnackbar>) {
  return render(
    <MemoryRouter>
      <UndoSnackbar {...props} />
    </MemoryRouter>,
  );
}

describe('UndoSnackbar', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders text in active phase', () => {
    renderWithRouter({ text: 'Item created.', phase: 'active', onDismiss: vi.fn(), dismissMs: DISMISS_MS });
    expect(screen.getByText('Item created.')).toBeInTheDocument();
  });

  it('shows Undo button in active phase when onUndo provided', () => {
    renderWithRouter({ text: 'Saved.', phase: 'active', onDismiss: vi.fn(), dismissMs: DISMISS_MS, onUndo: vi.fn() });
    expect(screen.getByRole('button', { name: /undo/i })).toBeInTheDocument();
  });

  it('hides Undo button when onUndo is omitted', () => {
    renderWithRouter({ text: 'Saved.', phase: 'active', onDismiss: vi.fn(), dismissMs: DISMISS_MS });
    expect(screen.queryByRole('button', { name: /undo/i })).not.toBeInTheDocument();
  });

  it('shows Undoing… button disabled in undoing phase', () => {
    renderWithRouter({ text: 'Saved.', phase: 'undoing', onDismiss: vi.fn(), dismissMs: DISMISS_MS, onUndo: vi.fn() });
    const btn = screen.getByRole('button', { name: /undoing/i });
    expect(btn).toBeInTheDocument();
    expect(btn).toBeDisabled();
  });

  it('calls onUndo when Undo clicked', async () => {
    const onUndo = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
    renderWithRouter({ text: 'Saved.', phase: 'active', onDismiss: vi.fn(), dismissMs: DISMISS_MS, onUndo });
    await user.click(screen.getByRole('button', { name: /undo/i }));
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it('shows successText in success phase', () => {
    renderWithRouter({ text: 'Saved.', phase: 'success', onDismiss: vi.fn(), dismissMs: DISMISS_MS, successText: 'Removed.' });
    expect(screen.getByText('Removed.')).toBeInTheDocument();
  });

  it('shows successLink in success phase', () => {
    renderWithRouter({
      text: 'Saved.',
      phase: 'success',
      onDismiss: vi.fn(),
      dismissMs: DISMISS_MS,
      successText: 'Removed.',
      successLink: { to: '/deleted', label: 'View deleted items' },
    });
    const link = screen.getByRole('link', { name: /view deleted items/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/deleted');
  });

  it('shows errorText in error phase', () => {
    renderWithRouter({
      text: 'Saved.',
      phase: 'error',
      onDismiss: vi.fn(),
      dismissMs: DISMISS_MS,
      errorText: 'Could not undo.',
    });
    expect(screen.getByText('Could not undo.')).toBeInTheDocument();
  });

  it('close (X) button dismisses immediately', async () => {
    const onDismiss = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
    renderWithRouter({ text: 'Saved.', phase: 'active', onDismiss, dismissMs: DISMISS_MS });
    await user.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('hides close button in success phase', () => {
    renderWithRouter({ text: 'Saved.', phase: 'success', onDismiss: vi.fn(), dismissMs: DISMISS_MS });
    expect(screen.queryByRole('button', { name: /dismiss/i })).not.toBeInTheDocument();
  });

  it('auto-dismisses after dismissMs', () => {
    const onDismiss = vi.fn();
    renderWithRouter({ text: 'Saved.', phase: 'active', onDismiss, dismissMs: DISMISS_MS });
    vi.advanceTimersByTime(DISMISS_MS);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
