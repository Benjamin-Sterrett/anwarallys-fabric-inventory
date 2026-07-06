import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Timestamp } from 'firebase/firestore';
import FindRoute from './find';
import type { RollItem } from '@/lib/models';

const mockListAllActiveItems = vi.hoisted(() => vi.fn());

vi.mock('@/lib/queries', async () => {
  const actual = await vi.importActual<typeof import('@/lib/queries')>('@/lib/queries');
  return {
    ...actual,
    listAllActiveItems: mockListAllActiveItems,
  };
});

function makeItem(overrides: Partial<RollItem> = {}): RollItem {
  return {
    itemId: 'item-1',
    sku: 'FAB-001',
    description: 'Red cotton',
    folderId: 'folder-1',
    folderAncestors: ['root', 'folder-1'],
    remainingMeters: 10,
    lastMovementId: 'mov-1',
    initialMeters: 20,
    minimumMeters: 5,
    photoUrl: null,
    supplier: null,
    price: null,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    createdBy: 'uid-1',
    updatedBy: 'uid-1',
    deletedAt: null,
    deletedBy: null,
    deleteReason: null,
    ...overrides,
  };
}

function renderFind() {
  return render(
    <MemoryRouter initialEntries={['/find']}>
      <Routes>
        <Route path="/find" element={<FindRoute />} />
        <Route path="/items/:itemId" element={<div>ITEM DETAIL PAGE</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('FindRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves a typed code to a tappable item that links to its detail page', async () => {
    mockListAllActiveItems.mockResolvedValue({
      ok: true,
      data: [
        makeItem({ itemId: 'item-1', sku: 'FAB-001', description: 'Red cotton' }),
        makeItem({ itemId: 'item-2', sku: 'FAB-002', description: 'Blue silk' }),
      ],
    });

    const user = userEvent.setup();
    renderFind();

    await waitFor(() => expect(screen.getByText(/start typing a code/i)).toBeInTheDocument());

    await user.type(screen.getByLabelText(/item code/i), 'FAB-001');

    // Only the matching item is shown, as a link to its detail route.
    const link = await screen.findByRole('link', { name: /FAB-001/i });
    expect(link).toHaveAttribute('href', '/items/item-1');
    expect(screen.queryByText('FAB-002')).not.toBeInTheDocument();
  });

  it('shows a clear no-match state for an unknown code', async () => {
    mockListAllActiveItems.mockResolvedValue({
      ok: true,
      data: [makeItem({ itemId: 'item-1', sku: 'FAB-001' })],
    });

    const user = userEvent.setup();
    renderFind();

    await waitFor(() => expect(screen.getByText(/start typing a code/i)).toBeInTheDocument());
    await user.type(screen.getByLabelText(/item code/i), 'ZZZ-999');

    expect(await screen.findByText(/no item found for/i)).toBeInTheDocument();
  });

  it('is case-insensitive when matching codes', async () => {
    mockListAllActiveItems.mockResolvedValue({
      ok: true,
      data: [makeItem({ itemId: 'item-1', sku: 'FAB-001' })],
    });

    const user = userEvent.setup();
    renderFind();

    await waitFor(() => expect(screen.getByText(/start typing a code/i)).toBeInTheDocument());
    await user.type(screen.getByLabelText(/item code/i), 'fab-001');

    const link = await screen.findByRole('link', { name: /FAB-001/i });
    expect(link).toHaveAttribute('href', '/items/item-1');
  });
});
