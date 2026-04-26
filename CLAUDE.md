# Anwarallys Fabric Inventory

## Session Start
Say: **"resume anwarallys"** — I'll check Linear for Anwarallys Fabric Inventory issues, read `.handoff.md`, and pick up where we left off.

**Quick commands:**
- `linear issue list --team PRJ` — see current issues
- `linear issue start PRJ-##` — start working on an issue

## Current Status
- **Phase:** Wave 1 — Schema + auto-deploy + data boundary shipped; next is Security Rules (PRJ-805) and auth UX (PRJ-781)
- **Last:** **PRJ-780 MERGED** (PR #4, squash `333f812`) — Firebase data-access boundary: `getDb()` + Firestore w/ `persistentLocalCache` + `persistentMultipleTabManager`, `auth.ts` init scaffold, 4 typed `FirestoreDataConverter`s, query wrappers including `createMovementAndAdjustItem` with `runTransaction` + optimistic concurrency + NaN/Infinity + actor-attribution guards. 4 lead Codex rounds, 9 findings fixed in-PR (PRJ-843..845, PRJ-847..849, PRJ-850..852), 2 deferred under `owner_override` (PRJ-854, PRJ-855).
- **Done:** Project scaffold + Linear project + Waves 0–6 + 7-LLM discovery/synthesis + locked architecture + 3 gating tickets (PRJ-804/805/806) + repo public + CI green + scaffold live + auto-deploy + schema shipped + **data boundary shipped**.
- **Next:** (1) **PRJ-805** Security Rules (Claude-only, CRITICAL — can start immediately, parallel-safe). (2) **PRJ-856** Self-service Staff page (replaces the seed-nicknames-from-WhatsApp plan; client adds/renames/deactivates staff himself). (3) **PRJ-781** Auth UX (no longer blocked on nicknames; ships after PRJ-805 + PRJ-856). (4) PRJ-854 / PRJ-855 follow-ups before any UI consumes `@/lib/queries`. (5) PRJ-841 (tests) + PRJ-842 (ESLint) follow-ups. (6) PRJ-804 validation checklist (physical checks).
- **Open architectural debate:** PRJ-840 — read/write model split. Held unified shape for v1; revisit if pilot surfaces real misuse.
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

**Last Updated:** 2026-04-26 (PRJ-780 merged, PR #4 squash `333f812`)
