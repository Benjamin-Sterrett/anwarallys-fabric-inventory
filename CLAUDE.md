# Anwarallys Fabric Inventory

## Session Start
Say: **"resume anwarallys"** — I'll check Linear for Anwarallys Fabric Inventory issues, read `.handoff.md`, and pick up where we left off.

**Quick commands:**
- `linear issue list --team PRJ` — see current issues
- `linear issue start PRJ-##` — start working on an issue

## Current Status
- **Phase:** **Wave 3 started — PRJ-787 stock adjustment SHIPPED.** The single highest-stakes ticket on the project (wrong-stock failure mode) is now live. Next: PRJ-788 + PRJ-789 finish Wave 3, then PRJ-792 starts Wave 4 (first Kimi pilot).
- **Last:** **PRJ-787** (PR #19 squash `43e8ffb`, 572 LOC over 500 ceiling under `owner_override` at SCOPE-CHECK and PR-REVIEW). Stock adjustment workflow with hold-to-confirm, server-authoritative reconcile on `meters-mismatch`/timeout, fresh `userDoc` per write. Used the existing `createMovementAndAdjustItem` boundary (PRJ-780) — no new transactional code. Required 7 Codex review rounds + 6 in-PR fix cycles closing real correctness bugs (float precision, cache-stale double-apply, attribution attack via timeout success-inference, stale displayName after admin rename). Severity trended HIGH+HIGH (R3) → MEDIUM+MEDIUM (R7). 3-cycle policy overridden under Telegram notification at R4 onwards. New helper `getItemByIdFromServer` added to data boundary. Filed: PRJ-883 (correlation-ID for atomic stock-write reconciliation, the only remaining schema-change follow-up), PRJ-884 (close confirm modal on staff-profile verify fail), PRJ-885 (preserve last-known item on server-read failure during recovery).
- **Done:** Scaffold + Linear project + Waves 0–6 + 7-LLM discovery/synthesis + locked architecture + 3 gating tickets + repo public + CI green + auto-deploy + schema + data boundary + data-boundary follow-ups + Security Rules + Rules defense-in-depth + bootstrap admin config + Self-service Staff (data + UI) + Auth UX + Folder browse/create + Item create/edit form + **Stock adjustment workflow**.
- **Next:** (1) **PRJ-788** reason chip selector polish (extract inline chips from `rolls-adjust.tsx` into reusable component). (2) **PRJ-789** movement history view (uses existing `listMovementsForItem` boundary). (3) **PRJ-883** correlation-ID schema change for late-success Undo on timeout (Movement schema + rules + UI; ride alongside PRJ-789). (4) **PRJ-792** QR generation — **first Kimi pilot ticket** (Wave 4). (5) Pre-pilot follow-up cluster: **PRJ-878/879/880/881/882/884/885**. Bundle into 1–2 PRs before pilot.
- **Bootstrap config — DONE 2026-04-26:** `VITE_ADMIN_EMAIL=shaaizladhani@gmail.com` set in GitHub Actions repo variables; `/config/admin.adminEmail` seeded (lowercase); Firebase Auth user `V000bembaURvXdqohY1DbAwlnB52` created with email verified; `/users/{uid}` doc seeded with `displayName: "Shaaiz", isActive: true`. Temp password in macOS Keychain (`anwarallys-shaaiz-bootstrap-password`). Documented in `~/.claude/reference/secrets-inventory.md`.
- **Open architectural debate:** PRJ-840 — read/write model split. Held unified shape for v1.
- **Handoff:** See `.handoff.md` for full session details + dependency order

## Project Management

**Linear project:** Anwarallys Fabric Inventory
- **Team:** Projects (PRJ)
- **Project:** Anwarallys Fabric Inventory

## Vision

Clean rebuild of a fragile AI-generated fabric-roll inventory prototype. One roll = one item. Each roll has a permanent QR code that opens only its adjustment page. Stock is tracked by remaining meters. Every adjustment records who, when, reason, old, and new values. Phone/tablet-first for 2–3 staff at a fabric store. The old HTML/Firebase prototype is reference-only, not a foundation — client confirmed no production data and full replacement is acceptable.

**Lowest acceptable product:** The smallest version that can survive a one-room pilot without creating inventory lies. Reliability over polish.

## Locked Product Decisions

- 1 roll = 1 item record; SKU and item code are the same thing.
- Each item gets one permanent QR. Scanning opens only that item's adjustment page.
- Stock = remaining meters (not a separate roll count). Item also stores original roll length.
- Every stock change records actor, timestamp, reason/note, old meters, new meters.
- Nested folders: minimum 4 levels, no artificial hard limit. Room → category → subcategory → location → item.
- Folder counts are derived from active item records.
- Deleted items → recently deleted → auto-clear after 7 days. Restore while in window.
- Items have a 2–3 line optional description/notes field.
- Staff/device attribution: Firebase Auth email/password, device-bound login. Two roles only — `admin` (matches `VITE_ADMIN_EMAIL`) and everyone else. Admin self-services staff via in-app `/staff` page (PRJ-856). No enterprise RBAC.
- Initial users: 2–3 staff on phone/tablet.

## Non-goals (v1)

- No decorative UI work, no analytics dashboards beyond a recent-changes list.
- No enterprise RBAC, no SSO, no complex role system.
- No data migration — current app has nothing worth preserving.
- No dual-unit editable stock systems.
- No elaborate label designer — basic print/download QR only.
- No folder deletion in v1 (in-app or via Console for non-leaf folders). Folders are rename-only; Rules cannot enforce subtree state and Console deletes of non-leaf folders recreate the orphan problem. Lands in PRJ-796 (Wave 5) with subtree-empty UI checks.

## Tech Stack (locked in `research/synthesis.md`)

| Component | Technology |
|-----------|------------|
| Hosting | Cloudflare Pages (deploy via GitHub Actions, no SSR) |
| Backend | Firebase / Firestore — **client SDK only**; Admin SDK forbidden in app path |
| Frontend | Vite 6 + React 19 + TypeScript strict + pnpm + Tailwind v4, plain SPA |
| Routing | `react-router-dom` v7 data-router, client-only |
| State | React Context + Firestore `onSnapshot` (no Redux/Zustand) |
| Auth | Firebase Auth — email/password + LOCAL persistence (`indexedDBLocalPersistence`) |
| Offline | `persistentLocalCache` + `persistentMultipleTabManager` (reads); writes BLOCKED when offline (pilot) |
| QR | `qrcode.react` `<QRCodeSVG>`, Level Q, marginSize=4, SVG only |
| URL scheme | `https://<short-host>/i/{firestoreAutoId}` — permanent, never regenerated |

## Client Context

- English is a second language for the client.
- Not technically literate — plain-language communication, low-friction workflows.
- Client has full access to Firebase + Cloudflare project accounts.
- Current live app has no important data. Full replacement is approved.

## Wave Plan

| Wave | Focus |
|------|-------|
| 0 | Intake, replacement plan, scope lock (mostly complete — captured in this doc + tickets) |
| 1 | Data model + system foundation (scaffold, schema, Firebase access boundary, attribution, export) |
| 2 | Folder and roll item management (nested folders, item create/edit, folder counts) |
| 3 | Stock adjustment + movement history (remaining meters, reason required, append-only history, dashboard) |
| 4 | Permanent QR flow (generate, print/download, scan-to-adjust route, phone/tablet validation) |
| 5 | Operational safety (recently deleted w/ 7-day retention, restore, low-stock, error states) |
| 6 | One-room pilot release (workflow test, accuracy verification, staff handoff notes, follow-up backlog) |

## Development Workflow (v5.7)

Use `/implement` or invoke the `dev-workflow` skill for any implementation task.

**Bug fixes:** Invoke `systematic-debugging` skill FIRST, then `dev-workflow`. Hook enforces `.debug-report.md` on `fix/*` branches.

**Full Path (Medium/High blast radius) — 18 steps:**
IDENTIFY → BRANCH → DISCOVER → PLAN → VALIDATE → APPROVE → IMPLEMENT → SCOPE-CHECK → VERIFY → SIMPLIFY → REVIEW → TRIAGE → FIX → RE-VERIFY → DELIVER → PR-REVIEW → DEPLOY-VERIFY → LINEAR-UPDATE

**Fast Path (Low blast radius) — 7 steps:**
IDENTIFY → DISCOVER → IMPLEMENT → VERIFY → DELIVER → PR-REVIEW → HANDOFF

**Rules:**
- No work without a Linear issue
- One sub-ticket = one branch = one PR (max 500 LOC per PR)
- Dual review (Security + Codex) required before commit
- Codex must APPROVE PR before merge
- Linear issues created for ALL review findings
- Context7 doc lookup mandatory before coding with any library (PLAN + IMPLEMENT)

**Scope discipline for this project:** v1 is the lowest acceptable product. Reject scope creep by pointing back to the Non-goals section.

## Current Infrastructure

- **Cloudflare Pages:** Live prototype deploy exists; client has access; replace freely.
- **Firebase:** Small project, minimal usage, client has access.
- **Credentials:** Store in macOS Keychain once wired up. Never commit.

## Major Risks

1. **Requirement drift.** v1 must stay narrow. Don't re-litigate locked decisions above.
2. **Overbuilding v1.** "Flexibility" means notes, nested folders, editable records — NOT ambiguous stock models.
3. **Weak attribution.** Shared login + device names is fine for v1; document the limit.
4. **Dual stock systems.** Never introduce a separate editable roll count alongside remaining meters.

## Code Standards
- Type hints/annotations required
- macOS Keychain for all secrets (no env vars, no inline)
- Follow project-specific linting rules

## Handoff Rules

**Before ending session or at 70%+ context:**
1. Update `.handoff.md` with what was completed, Linear status, blockers, next steps.
2. Update "Current Status" block above.
3. Commit any uncommitted work.

**Last Updated:** 2026-04-26 (PRJ-787 stock adjustment merged, PR #19 squash `43e8ffb` — Wave 3 started; highest-stakes ticket DONE)
