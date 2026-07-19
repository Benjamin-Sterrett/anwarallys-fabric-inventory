import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Timestamp } from 'firebase/firestore';
import { FolderBrowsePage } from './folder';
import type { Folder } from '@/lib/models';

const mockSubscribeToAuthState = vi.hoisted(() => vi.fn());
const mockGetFolderById = vi.hoisted(() => vi.fn());
const mockGetFolderSubtreeIsEmpty = vi.hoisted(() => vi.fn());
const mockSubscribeToFolderChildren = vi.hoisted(() => vi.fn());
const mockSubscribeToActiveItemsInFolder = vi.hoisted(() => vi.fn());

vi.mock('@/lib/firebase/auth', () => ({
  subscribeToAuthState: mockSubscribeToAuthState,
}));

vi.mock('@/lib/queries', async () => {
  const actual = await vi.importActual<typeof import('@/lib/queries')>('@/lib/queries');
  return {
    ...actual,
    getFolderById: mockGetFolderById,
    getFolderSubtreeIsEmpty: mockGetFolderSubtreeIsEmpty,
    subscribeToFolderChildren: mockSubscribeToFolderChildren,
    subscribeToActiveItemsInFolder: mockSubscribeToActiveItemsInFolder,
  };
});

const fakeUser = () =>
  ({ email: 'staff@fabric.local', emailVerified: true, uid: 'uid-1' }) as unknown as import('firebase/auth').User;

function makeFolder(overrides: Partial<Folder> = {}): Folder {
  return {
    folderId: 'folder-1',
    name: 'Room A',
    parentId: null,
    ancestors: [],
    depth: 0,
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

describe('FolderBrowsePage delete-confirm button (PRJ-2940 regression)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSubscribeToAuthState.mockImplementation((cb: (u: unknown) => void) => {
      cb(fakeUser());
      return () => {};
    });
    mockGetFolderById.mockResolvedValue({ ok: true, data: makeFolder() });
    // Empty subtree → the "Delete folder" affordance renders.
    mockGetFolderSubtreeIsEmpty.mockResolvedValue({
      ok: true,
      data: { empty: true, itemCount: 0, folderCount: 0 },
    });
    mockSubscribeToFolderChildren.mockImplementation((_p, next: (v: Folder[]) => void) => {
      next([]);
      return () => {};
    });
    mockSubscribeToActiveItemsInFolder.mockImplementation((_p, next: (v: unknown[]) => void) => {
      next([]);
      return () => {};
    });
  });

  // Top risk of the brand recolor: a destructive control silently adopting the
  // new brand green. The folder delete-confirm button must be RED BY
  // CONSTRUCTION (BTN_DANGER) — order-independent, never bg-brand/bg-gray-900.
  // Mirrors the guard in item-detail.test.tsx so BOTH delete buttons are covered.
  it('delete confirm button stays red and never adopts the brand green', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <FolderBrowsePage parentId="folder-1" />
      </MemoryRouter>,
    );

    const openDelete = await screen.findByRole('button', { name: 'Delete folder' });
    await user.click(openDelete);

    const confirm = await screen.findByRole('button', { name: 'Delete' });
    expect(confirm.className).toContain('bg-red-700');
    expect(confirm.className).not.toContain('bg-brand');
    expect(confirm.className).not.toContain('bg-gray-900');
  });
});
