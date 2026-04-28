import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Timestamp } from 'firebase/firestore';
import DeletedRoute from './deleted';
import { subscribeToAuthState } from '@/lib/firebase/auth';
import { subscribeToDeletedItems, subscribeToDeletedFolders, subscribeToAllUsers, subscribeToAllFolders, restoreItem, restoreFolder } from '@/lib/queries';

const mockSubscribeToAuthState = vi.hoisted(() => vi.fn());
const mockSubscribeToDeletedItems = vi.hoisted(() => vi.fn());
const mockSubscribeToDeletedFolders = vi.hoisted(() => vi.fn());
const mockSubscribeToAllUsers = vi.hoisted(() => vi.fn());
const mockSubscribeToAllFolders = vi.hoisted(() => vi.fn());
const mockRestoreItem = vi.hoisted(() => vi.fn());
const mockRestoreFolder = vi.hoisted(() => vi.fn());

vi.mock('@/lib/firebase/auth', () => ({
  subscribeToAuthState: mockSubscribeToAuthState,
}));

vi.mock('@/lib/queries', async () => {
  const actual = await vi.importActual<typeof import('@/lib/queries')>('@/lib/queries');
  return {
    ...actual,
    subscribeToDeletedItems: mockSubscribeToDeletedItems,
    subscribeToDeletedFolders: mockSubscribeToDeletedFolders,
    subscribeToAllUsers: mockSubscribeToAllUsers,
    subscribeToAllFolders: mockSubscribeToAllFolders,
    restoreItem: mockRestoreItem,
    restoreFolder: mockRestoreFolder,
  };
});

const fakeUser = () =>
  ({ email: 'staff@fabric.local', emailVerified: true, uid: 'uid-1' }) as unknown as import('firebase/auth').User;

function renderRoute() {
  return render(
    <MemoryRouter>
      <DeletedRoute />
    </MemoryRouter>,
  );
}

describe('DeletedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(subscribeToAuthState).mockImplementation((cb) => {
      cb(fakeUser());
      return vi.fn();
    });
    vi.mocked(subscribeToDeletedItems).mockReturnValue(vi.fn());
    vi.mocked(subscribeToDeletedFolders).mockReturnValue(vi.fn());
    vi.mocked(subscribeToAllUsers).mockImplementation((cb) => {
      cb([
        { uid: 'user-b', displayName: 'Alice', email: 'alice@local', isActive: true, createdAt: { toMillis: () => 0 }, updatedAt: { toMillis: () => 0 }, createdBy: 'admin', updatedBy: 'admin' },
        { uid: 'user-c', displayName: 'Bob', email: 'bob@local', isActive: true, createdAt: { toMillis: () => 0 }, updatedAt: { toMillis: () => 0 }, createdBy: 'admin', updatedBy: 'admin' },
      ] as unknown as import('@/lib/models').User[]);
      return vi.fn();
    });
    vi.mocked(subscribeToAllFolders).mockImplementation((cb) => {
      cb([
        { folderId: 'folder-1', name: 'Silks', parentId: null, ancestors: [], depth: 0, createdAt: { toMillis: () => 0 }, updatedAt: { toMillis: () => 0 }, createdBy: 'admin', updatedBy: 'admin', deletedAt: null, deletedBy: null, deleteReason: null },
        { folderId: 'room-a', name: 'Main Room', parentId: null, ancestors: [], depth: 0, createdAt: { toMillis: () => 0 }, updatedAt: { toMillis: () => 0 }, createdBy: 'admin', updatedBy: 'admin', deletedAt: null, deletedBy: null, deleteReason: null },
      ] as unknown as import('@/lib/models').Folder[]);
      return vi.fn();
    });
    vi.mocked(restoreItem).mockResolvedValue({ ok: true, data: undefined });
    vi.mocked(restoreFolder).mockResolvedValue({ ok: true, data: undefined });
  });

  it('shows loading skeleton while auth resolves', async () => {
    vi.mocked(subscribeToAuthState).mockImplementation((_cb) => {
      return vi.fn();
    });

    renderRoute();
    await waitFor(() => {
      expect(document.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
    });
  });

  it('shows sign-in prompt when signed out', async () => {
    vi.mocked(subscribeToAuthState).mockImplementation((cb) => {
      cb(null);
      return vi.fn();
    });

    renderRoute();
    await waitFor(() => {
      expect(screen.getByText(/You must be signed in/i)).toBeInTheDocument();
    });
  });

  it('renders empty state for both sections', async () => {
    vi.mocked(subscribeToDeletedItems).mockImplementation((onNext) => {
      onNext([]);
      return vi.fn();
    });
    vi.mocked(subscribeToDeletedFolders).mockImplementation((onNext) => {
      onNext([]);
      return vi.fn();
    });

    renderRoute();

    await waitFor(() => {
      expect(screen.getByText(/No deleted items in the last 7 days/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/No deleted folders in the last 7 days/i)).toBeInTheDocument();
  });

  it('renders deleted items', async () => {
    vi.mocked(subscribeToDeletedItems).mockImplementation((onNext) => {
      onNext([
        {
          itemId: 'item-1',
          sku: 'SKU-001',
          description: 'Red silk',
          folderId: 'folder-1',
          folderAncestors: ['folder-1'],
          remainingMeters: 10,
          lastMovementId: null,
          initialMeters: 100,
          minimumMeters: 5,
          photoUrl: null,
          supplier: null,
          price: null,
          createdAt: { toMillis: () => 0 },
          updatedAt: { toMillis: () => 0 },
          createdBy: 'user-a',
          updatedBy: 'user-a',
          deletedAt: Timestamp.fromMillis(Date.now() - 3600_000),
          deletedBy: 'user-b',
          deleteReason: 'Damaged',
        } as unknown as import('@/lib/models').RollItem,
      ]);
      return vi.fn();
    });
    vi.mocked(subscribeToDeletedFolders).mockImplementation((onNext) => {
      onNext([]);
      return vi.fn();
    });

    renderRoute();

    await waitFor(() => {
      expect(screen.getByText('SKU-001')).toBeInTheDocument();
    });
    expect(screen.getByText('Red silk')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('renders deleted folders', async () => {
    vi.mocked(subscribeToDeletedItems).mockImplementation((onNext) => {
      onNext([]);
      return vi.fn();
    });
    vi.mocked(subscribeToDeletedFolders).mockImplementation((onNext) => {
      onNext([
        {
          folderId: 'folder-1',
          name: 'Silks',
          parentId: 'room-a',
          ancestors: ['room-a'],
          depth: 1,
          createdAt: { toMillis: () => 0 },
          updatedAt: { toMillis: () => 0 },
          createdBy: 'user-a',
          updatedBy: 'user-a',
          deletedAt: Timestamp.fromMillis(Date.now() - 7200_000),
          deletedBy: 'user-c',
        } as unknown as import('@/lib/models').Folder,
      ]);
      return vi.fn();
    });

    renderRoute();

    await waitFor(() => {
      expect(screen.getByText('Silks')).toBeInTheDocument();
    });
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('Restore button opens confirmation modal', async () => {
    vi.mocked(subscribeToDeletedItems).mockImplementation((onNext) => {
      onNext([
        {
          itemId: 'item-1',
          sku: 'SKU-001',
          description: '',
          folderId: 'folder-1',
          folderAncestors: [],
          remainingMeters: 10,
          lastMovementId: null,
          initialMeters: 100,
          minimumMeters: 5,
          photoUrl: null,
          supplier: null,
          price: null,
          createdAt: { toMillis: () => 0 },
          updatedAt: { toMillis: () => 0 },
          createdBy: 'user-a',
          updatedBy: 'user-a',
          deletedAt: Timestamp.fromMillis(Date.now() - 3600_000),
          deletedBy: 'user-b',
          deleteReason: null,
        } as unknown as import('@/lib/models').RollItem,
      ]);
      return vi.fn();
    });
    vi.mocked(subscribeToDeletedFolders).mockImplementation((onNext) => {
      onNext([]);
      return vi.fn();
    });

    renderRoute();

    const restoreBtn = await screen.findByRole('button', { name: /restore/i });
    expect(restoreBtn).not.toBeDisabled();
    await userEvent.click(restoreBtn);

    await waitFor(() => {
      expect(screen.getByText(/Restore item\?/i)).toBeInTheDocument();
    });
    expect(screen.getByText('SKU-001')).toBeInTheDocument();
  });

  it('Restore button click → success → row disappears', async () => {
    vi.mocked(restoreItem).mockResolvedValue({ ok: true, data: undefined });

    vi.mocked(subscribeToDeletedItems).mockImplementation((onNext) => {
      onNext([
        {
          itemId: 'item-1',
          sku: 'SKU-001',
          description: '',
          folderId: 'folder-1',
          folderAncestors: [],
          remainingMeters: 10,
          lastMovementId: null,
          initialMeters: 100,
          minimumMeters: 5,
          photoUrl: null,
          supplier: null,
          price: null,
          createdAt: { toMillis: () => 0 },
          updatedAt: { toMillis: () => 0 },
          createdBy: 'user-a',
          updatedBy: 'user-a',
          deletedAt: Timestamp.fromMillis(Date.now() - 3600_000),
          deletedBy: 'user-b',
          deleteReason: null,
        } as unknown as import('@/lib/models').RollItem,
      ]);
      return vi.fn();
    });
    vi.mocked(subscribeToDeletedFolders).mockImplementation((onNext) => {
      onNext([]);
      return vi.fn();
    });

    renderRoute();

    const restoreBtn = await screen.findByRole('button', { name: /restore/i });
    await userEvent.click(restoreBtn);

    const confirmBtns = await screen.findAllByRole('button', { name: /^Restore$/i });
    expect(confirmBtns.length).toBe(2);
    await userEvent.click(confirmBtns[1]!);

    await waitFor(() => {
      expect(screen.queryByText('SKU-001')).not.toBeInTheDocument();
    });
    expect(restoreItem).toHaveBeenCalledWith('item-1', 'uid-1');
  });

  it('Restore button click → failure → error shown', async () => {
    vi.mocked(restoreItem).mockResolvedValue({
      ok: false,
      error: { code: 'parent-deleted', message: 'The parent folder has been deleted.' },
    });

    vi.mocked(subscribeToDeletedItems).mockImplementation((onNext) => {
      onNext([
        {
          itemId: 'item-1',
          sku: 'SKU-001',
          description: '',
          folderId: 'folder-1',
          folderAncestors: [],
          remainingMeters: 10,
          lastMovementId: null,
          initialMeters: 100,
          minimumMeters: 5,
          photoUrl: null,
          supplier: null,
          price: null,
          createdAt: { toMillis: () => 0 },
          updatedAt: { toMillis: () => 0 },
          createdBy: 'user-a',
          updatedBy: 'user-a',
          deletedAt: Timestamp.fromMillis(Date.now() - 3600_000),
          deletedBy: 'user-b',
          deleteReason: null,
        } as unknown as import('@/lib/models').RollItem,
      ]);
      return vi.fn();
    });
    vi.mocked(subscribeToDeletedFolders).mockImplementation((onNext) => {
      onNext([]);
      return vi.fn();
    });

    renderRoute();

    const restoreBtn = await screen.findByRole('button', { name: /restore/i });
    await userEvent.click(restoreBtn);

    const confirmBtns = await screen.findAllByRole('button', { name: /^Restore$/i });
    expect(confirmBtns.length).toBe(2);
    await userEvent.click(confirmBtns[1]!);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/parent folder has been deleted/i);
    });
  });

  it('shows delete reason, displayName, and breadcrumb path [PRJ-923]', async () => {
    vi.mocked(subscribeToDeletedItems).mockImplementation((onNext) => {
      onNext([
        {
          itemId: 'item-1',
          sku: 'SKU-001',
          description: 'Red silk',
          folderId: 'folder-1',
          folderAncestors: ['room-a', 'folder-1'],
          remainingMeters: 10,
          lastMovementId: null,
          initialMeters: 100,
          minimumMeters: 5,
          photoUrl: null,
          supplier: null,
          price: null,
          createdAt: { toMillis: () => 0 },
          updatedAt: { toMillis: () => 0 },
          createdBy: 'user-a',
          updatedBy: 'user-a',
          deletedAt: Timestamp.fromMillis(Date.now() - 3600_000),
          deletedBy: 'user-b',
          deleteReason: 'Damaged',
        } as unknown as import('@/lib/models').RollItem,
      ]);
      return vi.fn();
    });
    vi.mocked(subscribeToDeletedFolders).mockImplementation((onNext) => {
      onNext([]);
      return vi.fn();
    });

    renderRoute();

    await waitFor(() => {
      expect(screen.getByText('SKU-001')).toBeInTheDocument();
    });

    // displayName resolved from uid
    expect(screen.getByText('Alice')).toBeInTheDocument();

    // delete reason shown
    expect(screen.getByText('Damaged')).toBeInTheDocument();

    // breadcrumb path from folderAncestors + folderNameMap
    expect(screen.getByText(/Main Room/)).toBeInTheDocument();
    expect(screen.getByText(/Silks/)).toBeInTheDocument();
  });

  it('pre-disables item Restore when parent folder is deleted [PRJ-924]', async () => {
    vi.mocked(subscribeToDeletedItems).mockImplementation((onNext) => {
      onNext([
        {
          itemId: 'item-1',
          sku: 'SKU-001',
          description: '',
          folderId: 'folder-deleted',
          folderAncestors: [],
          remainingMeters: 10,
          lastMovementId: null,
          initialMeters: 100,
          minimumMeters: 5,
          photoUrl: null,
          supplier: null,
          price: null,
          createdAt: { toMillis: () => 0 },
          updatedAt: { toMillis: () => 0 },
          createdBy: 'user-a',
          updatedBy: 'user-a',
          deletedAt: Timestamp.fromMillis(Date.now() - 3600_000),
          deletedBy: 'user-b',
          deleteReason: null,
        } as unknown as import('@/lib/models').RollItem,
      ]);
      return vi.fn();
    });
    vi.mocked(subscribeToDeletedFolders).mockImplementation((onNext) => {
      onNext([
        {
          folderId: 'folder-deleted',
          name: 'Deleted Parent',
          parentId: null,
          ancestors: [],
          depth: 0,
          createdAt: { toMillis: () => 0 },
          updatedAt: { toMillis: () => 0 },
          createdBy: 'user-a',
          updatedBy: 'user-a',
          deletedAt: Timestamp.fromMillis(Date.now() - 3600_000),
          deletedBy: 'user-c',
        } as unknown as import('@/lib/models').Folder,
      ]);
      return vi.fn();
    });

    renderRoute();

    const btn = await screen.findByRole('button', { name: /unavailable/i });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('title', 'Restore the parent folder first');
  });

  it('pre-disables folder Restore when its parent is deleted [PRJ-924]', async () => {
    vi.mocked(subscribeToDeletedItems).mockImplementation((onNext) => {
      onNext([]);
      return vi.fn();
    });
    vi.mocked(subscribeToDeletedFolders).mockImplementation((onNext) => {
      onNext([
        {
          folderId: 'folder-child',
          name: 'Child Folder',
          parentId: 'folder-deleted',
          ancestors: ['folder-deleted'],
          depth: 1,
          createdAt: { toMillis: () => 0 },
          updatedAt: { toMillis: () => 0 },
          createdBy: 'user-a',
          updatedBy: 'user-a',
          deletedAt: Timestamp.fromMillis(Date.now() - 3600_000),
          deletedBy: 'user-c',
        } as unknown as import('@/lib/models').Folder,
        {
          folderId: 'folder-deleted',
          name: 'Deleted Parent',
          parentId: null,
          ancestors: [],
          depth: 0,
          createdAt: { toMillis: () => 0 },
          updatedAt: { toMillis: () => 0 },
          createdBy: 'user-a',
          updatedBy: 'user-a',
          deletedAt: Timestamp.fromMillis(Date.now() - 3600_000),
          deletedBy: 'user-c',
        } as unknown as import('@/lib/models').Folder,
      ]);
      return vi.fn();
    });

    renderRoute();

    const btns = await screen.findAllByRole('button', { name: /unavailable/i });
    expect(btns.length).toBe(1);
    expect(btns[0]).toHaveAttribute('title', 'Restore the parent folder first');
  });

  it('does not duplicate folder parent path segment [PRJ-924]', async () => {
    vi.mocked(subscribeToDeletedItems).mockImplementation((onNext) => {
      onNext([]);
      return vi.fn();
    });
    vi.mocked(subscribeToDeletedFolders).mockImplementation((onNext) => {
      onNext([
        {
          folderId: 'folder-1',
          name: 'Silks',
          parentId: 'room-a',
          ancestors: ['room-a'],
          depth: 1,
          createdAt: { toMillis: () => 0 },
          updatedAt: { toMillis: () => 0 },
          createdBy: 'user-a',
          updatedBy: 'user-a',
          deletedAt: Timestamp.fromMillis(Date.now() - 7200_000),
          deletedBy: 'user-c',
        } as unknown as import('@/lib/models').Folder,
      ]);
      return vi.fn();
    });

    renderRoute();

    await waitFor(() => {
      expect(screen.getByText('Silks')).toBeInTheDocument();
    });

    const parentText = screen.getByText(/Parent:/);
    expect(parentText.textContent).toBe('Parent: Main Room');
    expect(parentText.textContent).not.toMatch(/Main Room.*Main Room/);
  });
});
