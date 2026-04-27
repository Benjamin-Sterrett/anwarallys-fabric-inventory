# Kimi Ticket Order — Anwarallys Fabric Inventory

**Last updated:** 2026-04-26 (after Wave 3 close — PRJ-890 + PRJ-883 + PRJ-789 all merged)
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

5. **PRJ-879 — Live items snapshot in folder browse**
   - Replace one-shot `getDocs` with `onSnapshot` in `folder.tsx` items list. Pattern already used elsewhere.

6. **PRJ-880 — Items list paging in folder browse (cursor-based, default 50/page)**
   - Small infra add. Pairs naturally with PRJ-879.

7. **PRJ-882 — `item-form.tsx` validate parent folder is active before edit submit**
   - Small validation add in item-form.tsx.

8. **PRJ-884 — Close confirm modal on staff-profile verify fail**
   - Small UX fix in `src/routes/rolls-adjust.tsx`.

9. **PRJ-885 — Preserve last-known item on server-read failure during recovery**
   - Small UX fix in `src/routes/rolls-adjust.tsx`.

## PHASE 3 — operational + test infra

10. **PRJ-891 — Pre-pilot wipe of smoke residue**
    - Operational, no code. Benjamin runs this directly via Firebase Console (~2 min).
    - 5 docs to wipe: folder `rDeCpIe15Tk4kb8i5AWs`, item `R11YEDSZGCPRw8skRCMR`, movements `Dj6KYyXpMIw9oI8Q96Jg` / `tooVClNspmqpkGOHEsRp` / `rHpUudZoesN2PNxaFu6T`.

11. **PRJ-841 — Vitest setup + first happy-path tests**
    - Mechanical infra ticket. Unblocks PRJ-872, PRJ-875, PRJ-881.

## PHASE 4 — QR continuation

12. **PRJ-793 — QR print/download**
    - Builds on PRJ-792. Small, visually verifiable.

13. **PRJ-794 — QR scan landing route (`/i/{itemId}`)**
    - Tiny route — just navigates to the existing `/items/{itemId}` detail page.

## PHASE 5 — return Kimi to Wave 5 simple work

14. **PRJ-798 — Low-stock indicator on item-detail page**
    - Plain UI: read `item.minimumMeters` vs `item.remainingMeters`, show a badge. No new schema.

15. **PRJ-799 — Error states audit + polish**
    - UX-focused sweep across existing routes.

---

## KEEP THESE ON CLAUDE — do NOT route to Kimi

- **PRJ-892** — Write-side idempotency (Movement schema + Rules + boundary). Self-replay defense, safety-critical. PRJ-883 R9 owner_override comp action.
- **PRJ-893** — Server-authoritative mount-time reads audit (multi-route refactor with offline-vs-correctness trade-offs). PRJ-883 R4/R7 owner_override comp action.
- **PRJ-888** — CI auto-deploy of Firestore Rules + indexes. Infra/CI, gated on Shaaiz minting an SA key.
- **PRJ-796** — Soft-delete + 7-day retention. Rules-heavy, transactional, subtree-aware UI checks.
- **PRJ-797** — Restore from `/deletedRecords`. Pairs with PRJ-796.
- **PRJ-872 / PRJ-875 / PRJ-881** — tests for safety-critical boundary code (`createStaffUser` rollback, route guards, write boundary). Once PRJ-841 lands tooling, Claude can ship tests.

---

## Shipped (move tickets here as they merge)

*(empty — Kimi hasn't started yet. As tickets land, append entries with PR #, squash SHA, and date. Format: `- [DATE] PRJ-XXX (PR #YY squash `commit`) — short note`.)*
