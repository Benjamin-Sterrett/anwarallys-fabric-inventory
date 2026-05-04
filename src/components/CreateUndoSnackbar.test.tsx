import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import CreateUndoSnackbar from './CreateUndoSnackbar';

const mockSoftDeleteItem = vi.hoisted(() => vi.fn());

vi.mock('@/lib/queries', () => ({
  softDeleteItem: mockSoftDeleteItem,
}));

const CREATE_UNDO_SNACKBAR_MS = 15_000;
const REMOVED_TOAST_MS = 4_000;

describe('CreateUndoSnackbar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders snackbar with item created message', () => {
    render(
      <MemoryRouter>
        <CreateUndoSnackbar itemId="item-1" actorUid="actor-1" onDismiss={vi.fn()} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Item created.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /undo/i })).toBeInTheDocument();
  });

  it('Undo click calls softDeleteItem with correct args', async () => {
    mockSoftDeleteItem.mockResolvedValue({ ok: true, data: undefined });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });

    render(
      <MemoryRouter>
        <CreateUndoSnackbar itemId="item-1" actorUid="actor-1" onDismiss={vi.fn()} />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: /undo/i }));
    expect(mockSoftDeleteItem).toHaveBeenCalledWith('item-1', 'created-by-mistake', 'actor-1');
  });

  it('15-sec timer dismisses snackbar', () => {
    const onDismiss = vi.fn();
    render(
      <MemoryRouter>
        <CreateUndoSnackbar itemId="item-1" actorUid="actor-1" onDismiss={onDismiss} />
      </MemoryRouter>,
    );

    vi.advanceTimersByTime(CREATE_UNDO_SNACKBAR_MS);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('on success shows Removed. toast and dismisses after 4s', async () => {
    mockSoftDeleteItem.mockResolvedValue({ ok: true, data: undefined });
    const onDismiss = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });

    render(
      <MemoryRouter>
        <CreateUndoSnackbar itemId="item-1" actorUid="actor-1" onDismiss={onDismiss} />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: /undo/i }));
    await waitFor(() => {
      expect(screen.getByText('Removed.')).toBeInTheDocument();
    });

    vi.advanceTimersByTime(REMOVED_TOAST_MS);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('on failure shows error and keeps snackbar dismissable via timer', async () => {
    mockSoftDeleteItem.mockResolvedValue({
      ok: false,
      error: { code: 'firestore/permission-denied', message: 'No permission' },
    });
    const onDismiss = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });

    render(
      <MemoryRouter>
        <CreateUndoSnackbar itemId="item-1" actorUid="actor-1" onDismiss={onDismiss} />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: /undo/i }));
    await waitFor(() => {
      expect(screen.getByText('Could not undo. Try deleting from the item page.')).toBeInTheDocument();
    });

    // Should still dismiss via the 15s timer.
    vi.advanceTimersByTime(CREATE_UNDO_SNACKBAR_MS);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('close (X) button dismisses snackbar immediately', async () => {
    const onDismiss = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });

    render(
      <MemoryRouter>
        <CreateUndoSnackbar itemId="item-1" actorUid="actor-1" onDismiss={onDismiss} />
      </MemoryRouter>,
    );

    const closeBtn = screen.getByRole('button', { name: /dismiss/i });
    expect(closeBtn).toBeInTheDocument();

    await user.click(closeBtn);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('shows View deleted items link in Removed phase', async () => {
    mockSoftDeleteItem.mockResolvedValue({ ok: true, data: undefined });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });

    render(
      <MemoryRouter>
        <CreateUndoSnackbar itemId="item-1" actorUid="actor-1" onDismiss={vi.fn()} />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: /undo/i }));
    await waitFor(() => {
      expect(screen.getByText('Removed.')).toBeInTheDocument();
    });

    const link = screen.getByRole('link', { name: /view deleted items/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/deleted');
  });
});
