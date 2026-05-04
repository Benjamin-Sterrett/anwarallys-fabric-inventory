import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Timestamp } from 'firebase/firestore';
import ItemDetailRoute from './item-detail';
import { subscribeToAuthState } from '@/lib/firebase/auth';
import { getItemById, listMovementsForItem, getFolderById, createMovementAndAdjustItem, getUserByUid } from '@/lib/queries';
import type { RollItem, Movement } from '@/lib/models';

const mockSubscribeToAuthState = vi.hoisted(() => vi.fn());
const mockGetItemById = vi.hoisted(() => vi.fn());
const mockListMovementsForItem = vi.hoisted(() => vi.fn());
const mockGetFolderById = vi.hoisted(() => vi.fn());
const mockCreateMovementAndAdjustItem = vi.hoisted(() => vi.fn());
const mockGetUserByUid = vi.hoisted(() => vi.fn());
const mockSoftDeleteItem = vi.hoisted(() => vi.fn());

vi.mock('@/lib/firebase/auth', () => ({
  subscribeToAuthState: mockSubscribeToAuthState,
}));

vi.mock('@/lib/queries', async () => {
  const actual = await vi.importActual<typeof import('@/lib/queries')>('@/lib/queries');
  return {
    ...actual,
    getItemById: mockGetItemById,
    listMovementsForItem: mockListMovementsForItem,
    getFolderById: mockGetFolderById,
    createMovementAndAdjustItem: mockCreateMovementAndAdjustItem,
    getUserByUid: mockGetUserByUid,
    softDeleteItem: mockSoftDeleteItem,
  };
});

const fakeUser = () =>
  ({ email: 'staff@fabric.local', emailVerified: true, uid: 'uid-1' }) as unknown as import('firebase/auth').User;

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

function renderRoute(itemId = 'item-1') {
  return render(
    <MemoryRouter initialEntries={[`/items/${itemId}`]}>
      <Routes>
        <Route path="/items/:itemId" element={<ItemDetailRoute />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ItemDetailRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(subscribeToAuthState).mockImplementation((cb) => {
      cb(fakeUser());
      return () => {};
    });
    vi.mocked(getFolderById).mockResolvedValue({ ok: true, data: { folderId: 'root', name: 'Room A', parentId: null, ancestors: [], depth: 0, createdAt: Timestamp.now(), updatedAt: Timestamp.now(), createdBy: 'uid-1', updatedBy: 'uid-1', deletedAt: null, deletedBy: null, deleteReason: null } });
  });

  it('renders item details', async () => {
    vi.mocked(getItemById).mockResolvedValue({ ok: true, data: makeItem() });
    vi.mocked(listMovementsForItem).mockResolvedValue({ ok: true, data: { items: [makeMovement()], hasMore: false, lastCursor: null } });

    renderRoute();
    await waitFor(() => expect(screen.getByText('FAB-001')).toBeInTheDocument());
    expect(screen.getByText('10 m')).toBeInTheDocument();
  });

  it('shows Undo button for an old non-reversal last movement [PRJ-967]', async () => {
    vi.mocked(getItemById).mockResolvedValue({ ok: true, data: makeItem() });
    vi.mocked(listMovementsForItem).mockResolvedValue({
      ok: true,
      data: { items: [makeMovement({ at: Timestamp.fromMillis(Date.now() - 120_000) })], hasMore: false, lastCursor: null }
    });

    renderRoute();
    await waitFor(() => expect(screen.getByText(/Undo:/)).toBeInTheDocument());
  });

  it('annotates Undo button with delta, reason, actor and relative time [PRJ-967]', async () => {
    vi.mocked(getItemById).mockResolvedValue({ ok: true, data: makeItem({ remainingMeters: 15, lastMovementId: 'mov-2' }) });
    vi.mocked(listMovementsForItem).mockResolvedValue({
      ok: true,
      data: { items: [makeMovement({ movementId: 'mov-2', actorName: 'Aisha', reason: 'correction', deltaMeters: 5, oldMeters: 10, newMeters: 15 })], hasMore: false, lastCursor: null }
    });

    renderRoute();
    await waitFor(() => expect(screen.getByText(/Undo: \+5 m correction by Aisha/)).toBeInTheDocument());
  });

  it('hides Undo when last movement is a reversal', async () => {
    vi.mocked(getItemById).mockResolvedValue({ ok: true, data: makeItem() });
    vi.mocked(listMovementsForItem).mockResolvedValue({
      ok: true,
      data: { items: [makeMovement({ reversesMovementId: 'mov-prev' })], hasMore: false, lastCursor: null }
    });

    renderRoute();
    await waitFor(() => expect(screen.getByText('FAB-001')).toBeInTheDocument());
    expect(screen.queryByText(/Undo:/)).not.toBeInTheDocument();
  });

  it('hides Undo when item lastMovementId does not match', async () => {
    vi.mocked(getItemById).mockResolvedValue({ ok: true, data: makeItem({ lastMovementId: 'mov-other' }) });
    vi.mocked(listMovementsForItem).mockResolvedValue({
      ok: true,
      data: { items: [makeMovement()], hasMore: false, lastCursor: null }
    });

    renderRoute();
    await waitFor(() => expect(screen.getByText('FAB-001')).toBeInTheDocument());
    expect(screen.queryByText(/Undo:/)).not.toBeInTheDocument();
  });

  it('calls createMovementAndAdjustItem on Undo tap', async () => {
    const user = userEvent.setup();
    vi.mocked(getItemById).mockResolvedValue({ ok: true, data: makeItem() });
    vi.mocked(listMovementsForItem).mockResolvedValue({
      ok: true,
      data: { items: [makeMovement()], hasMore: false, lastCursor: null }
    });
    vi.mocked(getUserByUid).mockResolvedValue({ ok: true, data: { uid: 'uid-1', displayName: 'Shaaiz', email: 's@local', isActive: true, createdAt: Timestamp.now(), updatedAt: Timestamp.now(), createdBy: 'uid-1', updatedBy: 'uid-1' } });
    vi.mocked(createMovementAndAdjustItem).mockResolvedValue({ ok: true, data: { movementId: 'mov-undo', newMeters: 12, oldMeters: 10, deltaMeters: 2 } as Movement });

    renderRoute();
    await waitFor(() => expect(screen.getByText(/Undo:/)).toBeInTheDocument());

    const undoBtn = screen.getByText(/Undo:/);
    await user.click(undoBtn);

    await waitFor(() => expect(createMovementAndAdjustItem).toHaveBeenCalled());
    expect(mockCreateMovementAndAdjustItem).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId: 'item-1',
        expectedOldMeters: 10,
        newMeters: 12,
        reason: 'correction',
        reversesMovementId: 'mov-1',
      }),
    );
  });
});
