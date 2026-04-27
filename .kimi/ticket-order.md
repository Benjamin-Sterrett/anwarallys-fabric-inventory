# Kimi Ticket Order — Anwarallys Fabric Inventory

**Last updated:** 2026-04-27 (PRJ-872 + PRJ-881 + PRJ-875 merged; see Shipped)
**Source of truth:** this file. Original Telegram message preserved here.

## How to use this file

- Kimi works through tickets in **phase order**. Within a phase, lower ticket-number first unless dependencies dictate otherwise.
- Each session: read this file first, pick the next un-shipped ticket from the current phase.
- When a ticket merges: move it from the active list down to the "Shipped" section at the bottom (with PR # + commit SHA + date).
- If Kimi struggles on any ticket → stop, document the blocker, escalate back to Claude.
- Don't reorder phases without a real reason. The order is intentional: small + isolated first, then widen scope as Kimi proves out.

## Hard rules (apply to every Kimi ticket)

- Standard dev-workflow path. Codex review at PR. Lead (Claude or Benjamin) gates merges.
- Do NOT let Kimi modify `firestore.rules`, `firestore.indexes.json`, or `src/lib/queries/movements.ts` without explicit Claude oversight.
- Do NOT let Kimi touch `src/routes/rolls-adjust.tsx` beyond the small chip extraction (PRJ-788) and the small UX fixes (PRJ-884, PRJ-885) — that surface is safety-critical.
- 500 LOC ceiling stays.
- Each Kimi ticket: spawn teammate, lead Codex review, `owner_override` allowed ONLY for non-correctness deferrals with a comp-action ticket filed.

---

## PHASE 1 — first Kimi pilot

1. **PRJ-792 — QR code generation**
   - Why first: designated pilot ticket. Tiny, self-contained.
   - Code sample literally in `research/synthesis.md` §2: `qrcode.react` SVG, Level Q, `marginSize=4`, permanent URL `/i/{firestoreAutoId}`.
   - Visually verifiable. No Rules, no schema.

## PHASE 2 — small UI polish (low risk, builds Kimi confidence)

2. **PRJ-788 — Reason chip selector extraction**
   - Move inline chip rendering in `src/routes/rolls-adjust.tsx` into a reusable `<ReasonChips />` component.
   - Pure UI refactor, no logic change.

3. **PRJ-876 — Sync Firebase Auth `displayName` when `createStaffUser` / `renameStaffUser` runs**
   - Small data-layer fix. Known parity gap from Wave 1 review.

4. **PRJ-878 — `folder.tsx` Retry button should retry folder metadata fetches**
   - Tiny UX fix in folder.tsx Retry handler.

5. **~~PRJ-879~~ — Live items snapshot in folder browse** ✅ SHIPPED PR #32
   - Replace one-shot `getDocs` with `onSnapshot` in `folder.tsx` items list. Pattern already used elsewhere.

6. **~~PRJ-880~~ — Items list paging in folder browse (cursor-based, default 50/page)** ✅ SHIPPED PR #36
   - Small infra add. Pairs naturally with PRJ-879.
   - Client-side paging (Option A) — preserves live updates from PRJ-879. PAGE_SIZE = 50 with Previous/Next + page indicator.

7. **~~PRJ-882~~ — `item-form.tsx` validate parent folder is active before edit submit** ✅ SHIPPED PR #33
   - Small validation add in item-form.tsx.

8. **~~PRJ-884~~ — Close confirm modal on staff-profile verify fail** ✅ SHIPPED PR #30
   - Small UX fix in `src/routes/rolls-adjust.tsx`.

9. **~~PRJ-885~~ — Preserve last-known item on server-read failure during recovery** ✅ SHIPPED PR #31
   - Small UX fix in `src/routes/rolls-adjust.tsx`.

## PHASE 3 — operational + test infra

10. **~~PRJ-891~~ — Pre-pilot wipe of smoke residue** ✅ SHIPPED 2026-04-26 (Claude executed via `firebase firestore:delete` after deploying Rules+indexes; all 5 docs gone, Linear closed)

11. **~~PRJ-841~~ — Vitest setup + first happy-path tests** ✅ SHIPPED PR #38
    - Mechanical infra ticket. Unblocks PRJ-872, PRJ-875, PRJ-881.
    - **SCOPE GAP:** Firestore boundary tests (createMovementAndAdjustItem concurrency, query wrappers, getDb/getAuth) and CI test:ci wiring deferred to follow-up tickets.

## PHASE 4 — QR continuation

12. **~~PRJ-793~~ — QR print/download** ✅ SHIPPED PR #39
    - Builds on PRJ-792. Small, visually verifiable.

13. **~~PRJ-794~~ — QR scan landing route (`/i/{itemId}`)** ✅ SHIPPED PR #40
    - Read-only item detail with auth handling, loading skeleton, and deleted-item states.

## PHASE 5 — return Kimi to Wave 5 simple work

14. ~~**PRJ-798 — Low-stock indicator on item-detail page**~~ ✅ SHIPPED PR #41
    - Plain UI: read `item.minimumMeters` vs `item.remainingMeters`, show a badge. No new schema.

15. ~~**PRJ-799 — Error states audit + polish**~~ ✅ SHIPPED PR #43
    - UX-focused sweep across existing routes.

---

## PRJ-841 Follow-ups (deferred scope — do NOT lose)

- ~~**PRJ-896**~~ — ✅ SHIPPED PR #44 (2026-04-26) — Firestore boundary tests for safety-critical writes. 38 new tests covering getDb/getAuth init, createItem/updateItem validation, createMovementAndAdjustItem validation.
- ~~**PRJ-897**~~ — ✅ SHIPPED PR #42 (2026-04-26) — CI wire `test:ci` into GitHub Actions deploy.yml.

## KEEP THESE ON CLAUDE — do NOT route to Kimi

- ~~**PRJ-892**~~ — ✅ SHIPPED PR #50 (2026-04-27) — Write-side idempotency (Movement schema + Rules + boundary). Self-replay defense, safety-critical. PRJ-883 R9 owner_override comp action.
- **~~PRJ-893~~** — Server-authoritative mount-time reads audit. **SHIPPED BY KIMI PR #34** (see Shipped). Was originally Claude-gated, but scope was smaller than expected (rolls-adjust already had server read; only staff.tsx + comments needed). Retaining in Claude-gate list for future tickets of this class.
- **PRJ-888** — CI auto-deploy of Firestore Rules + indexes. Infra/CI, gated on Shaaiz minting an SA key.
- **PRJ-796** — Soft-delete + 7-day retention. Rules-heavy, transactional, subtree-aware UI checks.
- **PRJ-797** — Restore from `/deletedRecords`. Pairs with PRJ-796.
- (none remaining in this section)

---

## Shipped (move tickets here as they merge)

- [2026-04-26] PRJ-792 (PR #26 squash `0dad24e`) — QR code generation. First Kimi pilot ticket.
- [2026-04-26] PRJ-788 (PR #28 squash `3501e2d`) — ReasonChips extraction from rolls-adjust.tsx.
- [2026-04-26] PRJ-876 (PR #27 squash `ecfbf74`) — Sync Firebase Auth displayName on createStaffUser / renameStaffUser.
- [2026-04-26] PRJ-878 (PR #29 squash `090afdc`) — Retry button retries folder metadata fetches.
- [2026-04-26] PRJ-884 (PR #30 squash `b48a34c`) — Close confirm modal on staff-profile verify fail.
- [2026-04-26] PRJ-885 (PR #31 squash `8a6d85c`) — Preserve last-known item on server-read failure.
- [2026-04-26] PRJ-879 (PR #32 squash `3e4b6a1`) — Live items snapshot in folder browse (onSnapshot).
- [2026-04-26] PRJ-882 (PR #33 squash `9bab49a`) — Validate parent folder active before edit submit.
- [2026-04-26] PRJ-893 (PR #34 squash `535095b`) — Server-authoritative mount reads on safety-critical routes. *Originally Claude-gated; scope was smaller than expected.*
- [2026-04-26] PRJ-880 (PR #36 squash `c87818c`) — Client-side paging for items list in folder browse. PAGE_SIZE = 50 with Previous/Next + page indicator.
- [2026-04-26] PRJ-841 (PR #38 squash `2a8775f`) — Vitest setup + first happy-path tests. **SCOPE GAP:** Firestore boundary tests (createMovementAndAdjustItem concurrency, query wrappers, getDb/getAuth) and CI test:ci wiring deferred to follow-up tickets.
- [2026-04-26] PRJ-793 (PR #39 squash `2789f30`) — QR print/download. Single-label + batch print routes, size selector (50mm/30mm), `@page` CSS scoped to `.label-print-mode`, `RollLabel` printable mode, `listAllActiveItems` query. Firestore `(deletedAt, sku)` composite index added.
- [2026-04-26] PRJ-794 (PR #40 squash `58e01df`) — QR scan landing route (`/i/:itemId`). Read-only item detail with auth redirect, skeleton loader with visible `itemId`, soft-deleted/not-found/error states, offline fallback to cache, server-authoritative first read.
- [2026-04-26] PRJ-798 (PR #41 squash `925794e`) — Low-stock indicator on item-detail page + low-stock list view (`/lowstock`).
- [2026-04-26] PRJ-799 (PR #43 squash `698e4e7`) — Error states audit: `role="alert"` on error paragraphs + retry buttons across 7 route files.
- [2026-04-26] PRJ-897 (PR #42 squash `c3d6c3e`) — CI wire `test:ci` into GitHub Actions.
- [2026-04-26] PRJ-896 (PR #44 squash `0b34cb4`) — Firestore boundary tests: getDb/getAuth init, createItem/updateItem validation, createMovementAndAdjustItem validation (38 new tests).
- [2026-04-27] PRJ-872 (PR #47 squash `e998d95`) — 16 tests for `createStaffUser` rollback paths. Lead Codex: owner_override on happy-path coverage (out-of-scope per ticket spec).
- [2026-04-27] PRJ-881 (PR #48 squash `7082574`) — 4 payload-integrity tests for createItem/updateItem. Lead Codex: APPROVE (1 MEDIUM: itemId not in forbidden list — non-blocking).
- [2026-04-27] PRJ-875 (PR #49 squash `89881b9`) — Added @testing-library/react + jest-dom + user-event. 9 tests: sanitizeContinue exhaustive, login flow (unsafe continue fallback, signed-in short-circuit, 6 error code surfaces), RequireAuth redirect, RequireAdmin gate. Lead Codex: APPROVE (clean pass).
- [2026-04-27] PRJ-892 (PR #50 squash `f5695ff`) — Write-side idempotency for stock-adjustment retries. Deterministic movement doc IDs (`movementRef.id === correlationId`), transaction reads movement before item, `already-applied` error + late-success UI path, `SaveState` replaces `inconclusivePending`, `actorUid` scoping restored in `findMovementByCorrelationId` (Codex R2). Lead Codex R3: APPROVE (1 LOW: query vs direct doc lookup optimization note).
