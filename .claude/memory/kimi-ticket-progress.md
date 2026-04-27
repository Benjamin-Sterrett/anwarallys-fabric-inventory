# Kimi Ticket Run Tracker

**Started:** 2026-04-26
**Runner:** Kimi (agent team lead)
**Branching:** worktree per ticket → teammate implements → lead reviews → merge

---

## Phase 1 — Pilot
- [x] **PRJ-792** — Generate permanent item QR code (`src/components/RollLabel.tsx`) — MERGED #26

## Phase 2 — UI Polish + Small Fixes
- [x] **PRJ-788** — Extract ReasonChips component from rolls-adjust.tsx — MERGED #28
- [x] **PRJ-876** — Sync Firebase Auth displayName on createStaffUser — MERGED #27
- [x] **PRJ-878** — folder.tsx Retry button retries metadata fetches — MERGED #29
- [x] **PRJ-879** — Live items snapshot in folder browse (onSnapshot) — MERGED #32
- [ ] **PRJ-880** — Items list paging in folder browse (cursor-based, 50/page)
- [x] **PRJ-882** — item-form.tsx validate parent folder active before edit submit — MERGED #33
- [x] **PRJ-884** — Close confirm modal on staff-profile verify fail — MERGED #30
- [x] **PRJ-885** — Preserve last-known item on server-read failure during recovery — MERGED #31

## Phase 2 — UI Polish + Small Fixes (continued)
- [x] **PRJ-893** — Server-authoritative mount-time reads on safety-critical routes — MERGED #34

## Phase 3 — Operational + Test Infra
- [ ] **PRJ-891** — Pre-pilot wipe of smoke residue (operational / Benjamin) — SKIP
- [ ] **PRJ-841** — Vitest setup + first happy-path tests

## Phase 4 — QR Continuation
- [ ] **PRJ-793** — QR print/download
- [ ] **PRJ-794** — QR scan landing route (/i/{itemId})

## Phase 5 — Wave 5 Simple Work
- [ ] **PRJ-798** — Low-stock indicator on item-detail page
- [ ] **PRJ-799** — Error states audit + polish

---

## Done Log

### PRJ-792
- Branch: `feature/PRJ-792-qr-generation`
- PR: #26
- Status: MERGED 2026-04-26
- Notes: 4 Codex rounds, owner_override at cap. RollLabel + VITE_PUBLIC_HOST deploy wiring.

### PRJ-876
- Branch: `feature/PRJ-876-auth-displayname`
- PR: #27
- Status: MERGED 2026-04-26
- Notes: 4 Codex rounds, owner_override at cap. updateProfile fail-closed with rollback state tracking.

### PRJ-788
- Branch: `feature/PRJ-788-reason-chips`
- PR: #28
- Status: MERGED 2026-04-26
- Notes: Extracted ReasonChips + reasonLabel from rolls-adjust.tsx. Codex EMPTY 3 rounds → owner_override.

### PRJ-878
- Branch: `feature/PRJ-878-retry-metadata`
- PR: #29
- Status: MERGED 2026-04-26
- Notes: Moved retryToken before metadata effects in folder.tsx; wired into currentFolder + ancestorEntries deps.

### PRJ-879
- Branch: `feature/PRJ-879-live-items-snapshot`
- PR: #32
- Status: MERGED 2026-04-26
- Notes: Added subscribeToActiveItemsInFolder mirroring subscribeToFolderChildren. Replaced one-shot getDocs in folder.tsx.

### PRJ-880
- Branch: `feature/PRJ-880-cursor-paging`
- PR: #?
- Status: pending
- Notes:

### PRJ-882
- Branch: `feature/PRJ-882-validate-parent-folder`
- PR: #33
- Status: MERGED 2026-04-26
- Notes: Edit mode loads parent folder via getFolderById. Renders error (not form) if missing/soft-deleted. retryToken wired.

### PRJ-884
- Branch: `feature/PRJ-884-modal-close-fail`
- PR: #30
- Status: MERGED 2026-04-26
- Notes: Added setConfirmOpen(false) in rolls-adjust.tsx when getUserByUid fails mid-save so error is visible, not behind modal.

### PRJ-885
- Branch: `feature/PRJ-885-preserve-item-on-read-fail`
- PR: #31
- Status: MERGED 2026-04-26
- Notes: reloadItemFromServer() sets verifyError instead of setItem(null) on read failure. Renders inline banner above form.

### PRJ-893
- Branch: `feature/PRJ-893-server-authoritative-reads`
- PR: #34
- Status: MERGED 2026-04-26
- Notes: Added listActiveStaffFromServer / listInactiveStaffFromServer in users.ts. staff.tsx uses server-authoritative reads. rolls-adjust.tsx verified already using getItemByIdFromServer. item-form.tsx + folder.tsx got cache-intent doc comments.

### PRJ-891
- Branch: N/A
- PR: N/A
- Status: skipped (operational)
- Notes: Benjamin runs via Firebase Console

### PRJ-841
- Branch: `feature/PRJ-841-vitest-setup`
- PR: #?
- Status: pending
- Notes:

### PRJ-793
- Branch: `feature/PRJ-793-qr-print-download`
- PR: #?
- Status: pending
- Notes:

### PRJ-794
- Branch: `feature/PRJ-794-qr-scan-route`
- PR: #?
- Status: pending
- Notes:

### PRJ-798
- Branch: `feature/PRJ-798-low-stock`
- PR: #?
- Status: pending
- Notes:

### PRJ-799
- Branch: `feature/PRJ-799-error-states`
- PR: #?
- Status: pending
- Notes:
