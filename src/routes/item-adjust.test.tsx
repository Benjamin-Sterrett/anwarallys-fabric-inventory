// PRJ-2254 — rolls/meters entry-unit toggle on the stock-adjust form.
//
// The conversion is asserted through the deterministic preview + Save-button
// label, which render `targetNewMeters` — the EXACT number the form hands to
// `createMovementAndAdjustItem` as `newMeters` (see item-adjust.tsx onConfirm:
// `newMeters: targetNewMeters`). Driving the HoldToConfirm gate (pointer hold +
// requestAnimationFrame) is flaky under jsdom, so we verify the value that
// WOULD be written rather than simulating the physical hold. Storage stays
// meters; rolls is a pure entry convenience over `initialMeters`.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Timestamp } from 'firebase/firestore';
import ItemAdjustRoute from './item-adjust';
import { subscribeToAuthState } from '@/lib/firebase/auth';
import { getItemByIdFromServer, getUserByUid } from '@/lib/queries';
import type { RollItem } from '@/lib/models';

const mockSubscribeToAuthState = vi.hoisted(() => vi.fn());
const mockGetItemByIdFromServer = vi.hoisted(() => vi.fn());
const mockGetUserByUid = vi.hoisted(() => vi.fn());
const mockCreateMovementAndAdjustItem = vi.hoisted(() => vi.fn());
const mockFindMovementByCorrelationId = vi.hoisted(() => vi.fn());

vi.mock('@/lib/firebase/auth', () => ({
  subscribeToAuthState: mockSubscribeToAuthState,
}));

vi.mock('@/lib/queries', async () => {
  const actual = await vi.importActual<typeof import('@/lib/queries')>('@/lib/queries');
  return {
    ...actual,
    getItemByIdFromServer: mockGetItemByIdFromServer,
    getUserByUid: mockGetUserByUid,
    createMovementAndAdjustItem: mockCreateMovementAndAdjustItem,
    findMovementByCorrelationId: mockFindMovementByCorrelationId,
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

function renderRoute(item: RollItem) {
  vi.mocked(getItemByIdFromServer).mockResolvedValue({ ok: true, data: item });
  vi.mocked(getUserByUid).mockResolvedValue({
    ok: true,
    data: {
      uid: 'uid-1', displayName: 'Shaaiz', email: 's@local', isActive: true,
      createdAt: Timestamp.now(), updatedAt: Timestamp.now(), createdBy: 'uid-1', updatedBy: 'uid-1',
    },
  });
  return render(
    <MemoryRouter initialEntries={['/items/item-1/adjust']}>
      <Routes>
        <Route path="/items/:id/adjust" element={<ItemAdjustRoute />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ItemAdjustRoute — rolls/meters entry unit (PRJ-2254)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(subscribeToAuthState).mockImplementation((cb) => {
      cb(fakeUser());
      return () => {};
    });
  });

  it('converts rolls → meters on the Set-to-exact tab (1 roll × 20 m = 20 m)', async () => {
    const user = userEvent.setup();
    renderRoute(makeItem({ remainingMeters: 10, initialMeters: 20 }));

    await screen.findByText('Adjust FAB-001');
    // Roll length caption proves the conversion basis is the item's initialMeters.
    expect(screen.getByText('1 roll = 20 m')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Rolls' }));
    await user.click(screen.getByRole('tab', { name: 'Set to exact' }));
    await user.type(screen.getByRole('textbox'), '1');

    // Save label renders targetNewMeters === the newMeters that would be written.
    expect(screen.getByRole('button', { name: 'Save 10 m → 20 m' })).toBeInTheDocument();
    expect(screen.getByText('1 roll × 20 m = 20 m')).toBeInTheDocument();
  });

  it('converts rolls → meters on the Sold/used tab (0.5 roll = 10 m sold → 0 m)', async () => {
    const user = userEvent.setup();
    renderRoute(makeItem({ remainingMeters: 10, initialMeters: 20 }));

    await screen.findByText('Adjust FAB-001');
    await user.click(screen.getByRole('button', { name: 'Rolls' })); // default tab is Sold/used
    await user.type(screen.getByRole('textbox'), '0.5');

    expect(screen.getByRole('button', { name: 'Save 10 m → 0 m' })).toBeInTheDocument();
    expect(screen.getByText('0.5 rolls × 20 m = 10 m')).toBeInTheDocument();
  });

  it('leaves meters mode unchanged — entry is taken verbatim, not multiplied', async () => {
    const user = userEvent.setup();
    renderRoute(makeItem({ remainingMeters: 10, initialMeters: 20 }));

    await screen.findByText('Adjust FAB-001');
    await user.click(screen.getByRole('tab', { name: 'Set to exact' }));
    // No unit toggle interaction — meters is the default.
    await user.type(screen.getByRole('textbox'), '5');

    // 5 is written as 5 m, NOT 5 × 20. Meters-as-truth is untouched.
    expect(screen.getByRole('button', { name: 'Save 10 m → 5 m' })).toBeInTheDocument();
    // Helper shows the roll-equivalent hint, but the stored target stays 5 m.
    expect(screen.getByText('≈ 0.25 rolls')).toBeInTheDocument();
  });

  it('hides roll mode and stays in meters when roll length is not meaningful (initialMeters = 0)', async () => {
    const user = userEvent.setup();
    renderRoute(makeItem({ remainingMeters: 10, initialMeters: 0 }));

    await screen.findByText('Adjust FAB-001');
    // No divide/multiply-by-zero surface: the Rolls toggle and roll caption are absent.
    expect(screen.queryByRole('button', { name: 'Rolls' })).not.toBeInTheDocument();
    expect(screen.queryByText(/1 roll =/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Set to exact' }));
    await user.type(screen.getByRole('textbox'), '5');

    expect(screen.getByRole('button', { name: 'Save 10 m → 5 m' })).toBeInTheDocument();
    // No roll-equivalent helper when roll mode is unavailable.
    expect(screen.queryByText(/rolls?/)).not.toBeInTheDocument();
  });
});
