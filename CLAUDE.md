# Anwarallys Fabric Inventory

## Session Start
Say: **"resume anwarallys"** — I'll check Linear for Anwarallys Fabric Inventory issues, read `.handoff.md`, and pick up where we left off.

**Quick commands:**
- `linear issue list --team PRJ` — see current issues
- `linear issue start PRJ-##` — start working on an issue

## Current Status
- **Phase:** 🟢 **SHAAIZ FEEDBACK BUNDLE SHIPPED 2026-05-04.** Pilot is live since 2026-04-28; Shaaiz's first-use reply (asking for Back button + Undo affordances) was answered with a 5-ticket bundle, all smoke-tested empirically on the live deploy. Awaiting his next round of feedback. Open architectural/tooling debt remains in the backlog but nothing pilot-blocking.
- **Live deploy:** main HEAD `2f6e65f` (PRJ-980). Cloudflare Pages serving https://anwarallysinventory.pages.dev. 198/198 tests passing. Firestore Rules + indexes deployed manually after every Rules-touching merge.
- **Bootstrap admin:** shaaizladhani@gmail.com (UID `V000bembaURvXdqohY1DbAwlnB52`). Password rotated 2026-04-28 via Firebase Auth REST API after smoke testing exposed cleartext in chat. New temp password in Keychain (`anwarallys-shaaiz-bootstrap-password`). Shaaiz instructed to change via in-app self-service flow on first sign-in.
- **Benjamin's smoke-test staff account (added 2026-05-04):** `bens.hph@gmail.com` (UID `6p2uMlS66ia1HYnE4k77VSyvRDR2`), displayName `Benjamin (smoke)`, staff role (non-admin). Credentials in Keychain at `anwarallys-benjamin-staff-password` + `anwarallys-benjamin-staff-email`; macOS Internet Password entry for browser autofill on `anwarallysinventory.pages.dev`. Used by chrome-agent smoke runs without sharing Shaaiz's admin credentials.
- **Tutorial fixtures retained in production** (intentional — Shaaiz onboarding uses them as concrete examples): folder tree Room A → Cottons → Plain → Shelf 3 + SMOKE-001 (low stock at 5m) + SMOKE2-001 (50m) + dual-actor movement history + deactivated `Smoke Test Staff` user. He wipes via the in-app delete UI when ready.
- **Shipped 2026-05-04 (this session):** PRJ-973 (BackButton audit fixes — print routes, fallbackTo prop, removed from folder.tsx); PRJ-974 (CreateUndoSnackbar polish — View-deleted link, close ✕, dedup constant); PRJ-975 (UndoSnackbar component extraction — caught a `submitting`-gate regression at lead audit, one REQUEST_CHANGES round); PRJ-977 (`/deleted` displayName regression for non-admin viewers — per-uid fallback); PRJ-980 (useRef Undo re-entry guard — defends same-tick double-fire).
- **Shipped 2026-04-27 → 2026-04-28 (pre-pilot session):** PRJ-872, 875, 881, 892 (test bundle + write-side idempotency); PRJ-905, 906, 907, 908 (lowstock filter, /rolls→/items rename, Undone toast, /staff header link); PRJ-910 (deactivation sign-in bounce); PRJ-904 (Scaffold-build placeholder removed); PRJ-911–917 (polish bundle); PRJ-919 (LowStockBadge + Breadcrumbs component tests); PRJ-920 (self-service password change); PRJ-796 + 797 (soft-delete + restore); PRJ-921 (deploy-blocking unused-imports hotfix); PRJ-922 (re-delete after restore tombstone bug); PRJ-923 (/deleted metadata polish); PRJ-924 (restore-blocked tooltip + path duplication fix); PRJ-925 (pre-push git hook).
- **Backlog (post-pilot, none blocking):** PRJ-969 (cache-freshness guard on persistent Undo — PRJ-967 owner_override comp), PRJ-918 (isActive race-window check in write flows), PRJ-901 (tighten /movements Rules), PRJ-902 (rolls-adjust SaveState component tests), PRJ-909 (flaky-Wi-Fi optimization for listAllActiveItems), PRJ-888 (CI auto-deploy of Rules + indexes — gated on Shaaiz minting SA key), PRJ-840 (read/write model split debate).
- **Open in dev-workflow project (not this repo):** PRJ-976 (P3 — Codex CLI no-VERDICT investigation), PRJ-981 (P2 — dev-workflow gate bypass investigation; forensic evidence shows Kimi skipping `dw-plan`/`dw-verify`/`dw-review` on most tickets and TaskCreate firing only 1× across 5 tickets — hooks aren't catching it).
- **Critical lessons captured this session** (banked as project + global memory):
  - Browser cache can fake a UI FAIL on chrome-agent smoke. Phase 0 bundle-hash check is now mandatory.
  - Synchronous JS double-fire is OUTSIDE realistic threat model; ≥150ms gap is the spec floor. Synthetic same-tick races exist in old code too — defense-in-depth, not regressions.
  - "Skipping Codex per PRJ-976" only applies to PR-REVIEW step, not `dw-review` (mid-impl). Kimi appears to be over-applying it.
  - Fix the system, not the lead. When a gate fails, fix the gate. Lead-side audit checklists are lateral work-shifting that defeats the separation-of-duties model.
- **Handoff:** See `.handoff.md` for full session details + post-pilot watch-items.

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

**Last Updated:** 2026-04-28 (Pilot delivered to Shaaiz. App live at https://anwarallysinventory.pages.dev with tutorial fixtures retained for onboarding. Awaiting first-use feedback.)
