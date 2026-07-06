// PRJ-2253 — item create pre-fills a generated item code, still editable.
// PRJ-2255 — item create can take/choose a photo (downscaled, inline preview).
//
// Scoped to the create-mode "Item code" behavior (generated + editable) and the
// photo picker (downscale → preview → remove; friendly error on reject).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Timestamp } from 'firebase/firestore';
import ItemNewRoute from './item-form';
import { subscribeToAuthState } from '@/lib/firebase/auth';
import { getFolderById } from '@/lib/queries';
import { downscaleImage } from '@/lib/image';
import type { Folder } from '@/lib/models';

const mockSubscribeToAuthState = vi.hoisted(() => vi.fn());
const mockGetFolderById = vi.hoisted(() => vi.fn());
const mockDownscaleImage = vi.hoisted(() => vi.fn());

vi.mock('@/lib/firebase/auth', () => ({
  subscribeToAuthState: mockSubscribeToAuthState,
}));

vi.mock('@/lib/queries', async () => {
  const actual = await vi.importActual<typeof import('@/lib/queries')>('@/lib/queries');
  return { ...actual, getFolderById: mockGetFolderById };
});

vi.mock('@/lib/image', () => ({ downscaleImage: mockDownscaleImage }));

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

describe('ItemNewRoute — photo picker (PRJ-2255)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(subscribeToAuthState).mockImplementation((cb) => { cb(fakeUser()); return () => {}; });
    vi.mocked(getFolderById).mockResolvedValue({ ok: true, data: makeFolder() });
  });

  const jpeg = () => new File([new Uint8Array([1, 2, 3])], 'roll.jpg', { type: 'image/jpeg' });

  it('downscales a picked photo and shows an inline preview', async () => {
    vi.mocked(downscaleImage).mockResolvedValue({ ok: true, dataUrl: 'data:image/jpeg;base64,PREVIEW' });
    const user = userEvent.setup();
    const { container } = renderNew();
    await screen.findByLabelText('Item code'); // form hydrated

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, jpeg());

    const img = await screen.findByAltText('Item photo preview');
    expect(img).toHaveAttribute('src', 'data:image/jpeg;base64,PREVIEW');
    expect(downscaleImage).toHaveBeenCalledOnce();
  });

  it('removes the photo when Remove is clicked', async () => {
    vi.mocked(downscaleImage).mockResolvedValue({ ok: true, dataUrl: 'data:image/jpeg;base64,PREVIEW' });
    const user = userEvent.setup();
    const { container } = renderNew();
    await screen.findByLabelText('Item code');

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, jpeg());
    await screen.findByAltText('Item photo preview');

    await user.click(screen.getByRole('button', { name: 'Remove photo' }));
    expect(screen.queryByAltText('Item photo preview')).not.toBeInTheDocument();
  });

  it('surfaces a friendly error and shows no preview when downscale fails', async () => {
    vi.mocked(downscaleImage).mockResolvedValue({ ok: false, error: 'That photo is too large even after shrinking. Try a smaller image.' });
    const user = userEvent.setup();
    const { container } = renderNew();
    await screen.findByLabelText('Item code');

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, jpeg());

    expect(await screen.findByRole('alert')).toHaveTextContent('too large');
    expect(screen.queryByAltText('Item photo preview')).not.toBeInTheDocument();
  });

  it('disables submit while a photo is still processing (no save race)', async () => {
    // A downscale that never resolves keeps photoBusy true.
    vi.mocked(downscaleImage).mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    const { container } = renderNew();
    await screen.findByLabelText('Item code');

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, jpeg());

    const submitBtn = await screen.findByRole('button', { name: 'Processing photo…' });
    expect(submitBtn).toBeDisabled();
  });

  it('blocks a direct form submit while the photo is still processing (stale-closure guard)', async () => {
    // Never-resolving downscale keeps photoBusy true. Submitting the form
    // directly bypasses the disabled button — the Enter-key path — so this only
    // passes if `submit` sees the live photoBusy (photoBusy in useCallback deps).
    vi.mocked(downscaleImage).mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    const { container } = renderNew();
    await screen.findByLabelText('Item code');

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, jpeg());
    await screen.findByRole('button', { name: 'Processing photo…' });

    fireEvent.submit(container.querySelector('form') as HTMLFormElement);
    expect(await screen.findByRole('alert')).toHaveTextContent('still processing');
  });

  it('rejects a pasted non-http(s) photo link on submit', async () => {
    const user = userEvent.setup();
    renderNew();
    await screen.findByLabelText('Item code');

    await user.type(screen.getByLabelText('Or paste a photo link'), 'ftp://host/pic.jpg');
    await user.click(screen.getByRole('button', { name: 'Create item' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('http://');
  });
});
