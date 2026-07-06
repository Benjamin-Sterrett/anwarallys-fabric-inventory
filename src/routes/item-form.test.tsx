// PRJ-2253 — item create pre-fills a generated item code, still editable.
//
// Scoped to the create-mode "Item code" behavior: the form should open with a
// generated code already in the field (so staff don't invent one), and typing
// must replace it (the field stays user-editable per the locked model).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Timestamp } from 'firebase/firestore';
import ItemNewRoute from './item-form';
import { subscribeToAuthState } from '@/lib/firebase/auth';
import { getFolderById } from '@/lib/queries';
import type { Folder } from '@/lib/models';

const mockSubscribeToAuthState = vi.hoisted(() => vi.fn());
const mockGetFolderById = vi.hoisted(() => vi.fn());

vi.mock('@/lib/firebase/auth', () => ({
  subscribeToAuthState: mockSubscribeToAuthState,
}));

vi.mock('@/lib/queries', async () => {
  const actual = await vi.importActual<typeof import('@/lib/queries')>('@/lib/queries');
  return { ...actual, getFolderById: mockGetFolderById };
});

const fakeUser = () =>
  ({ email: 'staff@fabric.local', emailVerified: true, uid: 'uid-1' }) as unknown as import('firebase/auth').User;

function makeFolder(): Folder {
  return {
    folderId: 'folder-1', name: 'Shelf 3', parentId: 'root', ancestors: ['root'],
    depth: 1, createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
    createdBy: 'uid-1', updatedBy: 'uid-1', deletedAt: null, deletedBy: null, deleteReason: null,
  };
}

function renderNew() {
  return render(
    <MemoryRouter initialEntries={['/folders/folder-1/items/new']}>
      <Routes>
        <Route path="/folders/:folderId/items/new" element={<ItemNewRoute />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ItemNewRoute — generated item code (PRJ-2253)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(subscribeToAuthState).mockImplementation((cb) => { cb(fakeUser()); return () => {}; });
    vi.mocked(getFolderById).mockResolvedValue({ ok: true, data: makeFolder() });
  });

  it('opens with a generated item code already populated', async () => {
    renderNew();
    const field = await screen.findByLabelText('Item code');
    await waitFor(() => expect((field as HTMLInputElement).value).toMatch(/^FAB-\d{6}-[A-Z0-9]{4}$/));
  });

  it('lets staff replace the generated code before saving', async () => {
    const user = userEvent.setup();
    renderNew();
    const field = (await screen.findByLabelText('Item code')) as HTMLInputElement;
    await waitFor(() => expect(field.value).not.toBe(''));

    await user.clear(field);
    await user.type(field, 'MY-CUSTOM-CODE');
    expect(field.value).toBe('MY-CUSTOM-CODE');
  });
});
