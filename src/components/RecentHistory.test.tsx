import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Timestamp } from 'firebase/firestore';
import RecentHistory from './RecentHistory';
import type { Movement } from '@/lib/models';

const mockListMovementsForItem = vi.hoisted(() => vi.fn());

vi.mock('@/lib/queries', async () => {
  const actual = await vi.importActual<typeof import('@/lib/queries')>('@/lib/queries');
  return {
    ...actual,
    listMovementsForItem: mockListMovementsForItem,
  };
});

function makeMovement(overrides: Partial<Movement> = {}): Movement {
  return {
    movementId: 'mov-1',
    itemId: 'item-1',
    folderIdAtTime: 'folder-1',
    folderAncestorsAtTime: ['root', 'folder-1'],
    oldMeters: 12,
    newMeters: 10,
    deltaMeters: -2,
    reason: 'sold',
    note: null,
    actorUid: 'uid-1',
    actorName: 'Shaaiz',
    at: Timestamp.fromMillis(Date.now() - 120_000), // 2 min ago
    reversesMovementId: null,
    clientCorrelationId: 'corr-1',
    ...overrides,
  };
}

function renderPreview(itemId = 'item-1') {
  return render(
    <MemoryRouter>
      <RecentHistory itemId={itemId} />
    </MemoryRouter>,
  );
}

describe('RecentHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders recent movements with a link to the full history', async () => {
    mockListMovementsForItem.mockResolvedValue({
      ok: true,
      data: {
        items: [makeMovement({ movementId: 'mov-1', oldMeters: 12, newMeters: 10, deltaMeters: -2 })],
        hasMore: false,
        lastCursor: null,
      },
    });

    renderPreview('item-1');

    // Preview row renders old→new meters, delta, reason, actor.
    await waitFor(() => expect(screen.getByText(/12 m/)).toBeInTheDocument());
    expect(screen.getByText(/10 m/)).toBeInTheDocument();
    expect(screen.getByText('−2 m')).toBeInTheDocument();
    expect(screen.getByText('Shaaiz')).toBeInTheDocument();

    // "View full history" links to the item-detail route.
    const link = screen.getByRole('link', { name: /view full history/i });
    expect(link).toHaveAttribute('href', '/items/item-1');

    // Only the requested limit is fetched (default 3).
    expect(mockListMovementsForItem).toHaveBeenCalledWith('item-1', 3);
  });

  it('shows an empty state when the item has no movements', async () => {
    mockListMovementsForItem.mockResolvedValue({
      ok: true,
      data: { items: [], hasMore: false, lastCursor: null },
    });

    renderPreview('item-1');

    await waitFor(() => expect(screen.getByText(/no movements yet/i)).toBeInTheDocument());
  });

  it('shows an error with a retry when the history read fails', async () => {
    mockListMovementsForItem.mockResolvedValue({
      ok: false,
      error: { code: 'firestore/unavailable', message: 'offline' },
    });

    renderPreview('item-1');

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/could not load history/i));
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });
});
