# Anwarallys Fabric Inventory

Clean rebuild of a fabric-roll inventory system for a one-room pilot. Phone/tablet-first. Firebase backend, Cloudflare Pages hosting.

## Product at a glance

- **1 roll = 1 item.** SKU and item code are the same thing.
- **Permanent QR per item.** Scanning opens only that item's adjustment page.
- **Stock = remaining meters.** Each item also stores original roll length.
- **Every stock change is audited:** actor, timestamp, reason/note, old meters, new meters.
- **Nested folders** (≥4 levels) for rooms, categories, subcategories, locations.
- **Recently deleted** with 7-day retention + restore.

The old HTML/Firebase prototype is reference only. It has no production data and is fully replaceable.

## Tech stack

Locked in `research/synthesis.md` §3:

| Layer | Pick |
|---|---|
| Framework | Vite 6 + React 19 + TypeScript strict |
| Routing | `react-router-dom` v7 data router |
| Styling | Tailwind v4 via `@tailwindcss/vite` |
| State | React Context + Firestore `onSnapshot` (no Redux/Zustand) |
| Backend | Firebase client SDK v10+ (Auth + Firestore) |
| Hosting | Cloudflare Pages (deploy via GitHub Actions, static SPA) |
| Package manager | pnpm |

No SSR. No `firebase-admin`. No server-side anything — Firestore Security Rules are the entire authz surface.

### Data access boundary

UI components MUST import data-access helpers from `@/lib/queries`. Direct calls to `getFirestore()`, `collection()`, `doc()`, `setDoc()`, `updateDoc()`, or `runTransaction()` from React components are forbidden by convention. The single Firestore accessor lives in `src/lib/firebase/app.ts` and is exposed only through `getDb()`; the typed query/mutation wrappers in `src/lib/queries/` are the call surface for everything else.

The most safety-critical helper is `createMovementAndAdjustItem` — it's the **only** supported way to mutate `RollItem.remainingMeters`. Two concurrent stock adjustments are guarded by a caller-supplied `expectedOldMeters` snapshot inside `runTransaction`; a stale snapshot returns `err('meters-mismatch', …)` and the UI surfaces a "stock changed, refresh" dialog. Don't add convenience setters that bypass this path.

Future ESLint rule (PRJ-842) will enforce the import boundary mechanically. For now, code review enforces it. Tests for the data layer (Vitest setup + happy-path + concurrency) ship in PRJ-841.

## Local setup

Requires Node 20+ and pnpm 9+.

```bash
pnpm install
cp .env.example .env.local    # fill in real Firebase values
pnpm dev                      # http://localhost:5173
```

### Scripts

- `pnpm dev` — Vite dev server with HMR
- `pnpm build` — type-check + production build to `dist/`
- `pnpm typecheck` — strict TS check only
- `pnpm preview` — serve the built `dist/` locally

Tests land with PRJ-779+ (Vitest). No test runner is installed yet.

## Environment variables

All Firebase web-SDK config lives in `.env.local` (gitignored). Every var is prefixed `VITE_` so Vite exposes it to the browser bundle.

Required:
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

### Firebase config is public

These values are intentionally client-safe. Firebase's own docs treat the web config as public — it just identifies the project, it does not grant access. Access is controlled entirely by Firestore Security Rules (see `firestore.rules`, fleshed out in PRJ-805). Do **not** commit a service-account JSON — that IS sensitive and never belongs in this repo.

## Deploy flow

Production deploys run via **GitHub Actions** (`.github/workflows/deploy.yml`), not Cloudflare Pages' native git integration. Cloudflare Pages still hosts; the project's `Git Provider` is intentionally `No` because the account owner has no GitHub. The workflow builds with pnpm and pushes the bundle through `cloudflare/wrangler-action@v3` using a scoped API token.

1. Open PR → `ci.yml` runs typecheck + build.
2. Merge to `main` → `deploy.yml` builds, then `wrangler pages deploy dist/` lands at `anwarallysinventory.pages.dev` within ~60s.
3. Firestore rules and indexes deploy via Firebase CLI separately:
   ```bash
   firebase deploy --only firestore:rules,firestore:indexes
   ```

Required repo secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and the six `VITE_FIREBASE_*` values from the project's Firebase web config (already set; rotate when Firebase config rotates). Reusable recipe: `~/.claude/reference/cloudflare-pages-github-actions.md`.

`public/_redirects` ships `/* /index.html 200` so hard reloads on `/i/abc123` (QR scan links) serve the SPA shell instead of 404.

## Routes

All routes except `/` are placeholder stubs. Real feature work lives in later tickets.

| Path | Purpose | Ticket |
|---|---|---|
| `/` | Dashboard | PRJ-799 |
| `/login` | Sign in | PRJ-781 |
| `/i/:itemId` | QR landing (read-only) | PRJ-794 |
| `/rolls/:id/adjust` | Stock adjustment | PRJ-787 |
| `/folders/:id` | Folder browse | PRJ-783 |
| `/deleted` | Recently deleted (7-day) | PRJ-796 |
| `/lowstock` | Low-stock view | PRJ-798 |

## Sign in

Every page except `/login` requires sign-in. Hitting a protected URL while signed out redirects to `/login?continue=<path>`; after sign-in the app lands back on the original path. QR scans (`/i/:itemId`) are protected too — Firestore Security Rules require `isActiveStaff()` to read items, so an unauthenticated scan goes through sign-in first and lands on the item.

**Bootstrap (one-time):**

1. Create the admin's Firebase Auth user in the Firebase Console (Authentication → Users → Add user). Set `Email verified` to `true` — Auth rules require it (parity with `firestore.rules` `isAdminUser()`).
2. Set `VITE_ADMIN_EMAIL` in `.env.local` (and in Cloudflare Pages env for production) to that same email.
3. Seed `/config/admin` in Firestore with field `adminEmail` set to the same email — see "Firestore Security Rules" below.
4. Seed a `/users/{adminUid}` doc with `displayName` and `isActive: true` — required for the admin to write inventory and movements.

After bootstrap the admin signs in once at `/login` and uses `/staff` to add the rest of the staff. Each new staff member can sign in immediately with the email + password the admin set.

**Sign-out, deactivation, and persistence:**

- Sessions persist via `[indexedDBLocalPersistence, browserLocalPersistence]`. Staff stay signed in on a device until they tap "Sign out" in the top bar.
- Deactivating a staff member from `/staff` flips `isActive` to `false`. The next Firestore read or write from that user fails immediately because Rules `isActiveStaff()` checks `isActive == true`. The user's existing browser session continues to display Auth-resolved chrome (their displayName) but every data action will fail until they're reactivated.
- iOS Safari ITP is mitigated by sticking to email/password (no third-party providers like Google/Apple, which trigger third-party-storage restrictions on Safari).

## Bundle size

First build (scaffold only, no Firebase wiring yet):

| File | Raw | Gzipped |
|---|---|---|
| `dist/index.html` | 0.60 kB | 0.35 kB |
| `dist/assets/index-*.css` | 8.04 kB | 2.60 kB |
| `dist/assets/index-*.js` | 287.13 kB | 91.78 kB |
| **Total `dist/`** | **~304 kB** | — |

Well under the Cloudflare Pages 25 MiB Worker-bundle limit (which doesn't apply to static SPAs, but we're tracking it anyway). Firebase client SDK dominates the JS chunk at this stage; feature-ticket bundles will grow modestly from here.

## Firestore Security Rules

`firestore.rules` is the entire authorization surface — there is no server, no Admin SDK, no Cloud Functions. PRJ-805 ships the full rules; trade-offs and helper conventions are documented inline at the top of the file.

**Bootstrap (one-time, before deploy):**

1. Open the Firebase Console → Firestore.
2. Create doc `/config/admin` with a single string field `adminEmail` set to the project admin's email. Casing does not matter — `isAdminUser()` lower-cases both sides before comparing (PRJ-873), so the seed can be any case (Auth normalizes server-side). The admin's Firebase Auth account MUST have `email_verified == true` — Auth rules require it. Confirm via the Firebase Console → Authentication → Users tab; if `Email verified` is `false`, send the verification email via the SDK or the Console.
3. Create a `/users/{uid}` doc for EVERY authenticated user (including the admin) with `isActive: true` and a non-empty `displayName`. Inventory rules gate on `isActiveStaff()` (checks `isActive == true`), and movement creates require `actorName == /users/{auth.uid}.displayName` (PRJ-859 anti-spoof). Until a user has a `/users` doc, they cannot write inventory or movements. The admin can self-provision via PRJ-856's `/staff` page once it ships, or seed manually now.

**v1 does not support folder deletion (PRJ-863, supersedes PRJ-860):** Firestore Security Rules cannot iterate `folderAncestors[]` (no list-iteration primitive in Rules expressions), so they cannot reliably reject item writes inside descendants of a deleted ancestor. v1 therefore disables in-app folder soft-delete entirely — folders are rename-only.

DO NOT use the Firebase Console to soft-delete or hard-delete non-leaf folders. Doing so leaves descendant subfolders and items active and writable (Rules only validate the DIRECT parent folder, not the full ancestor chain), which is exactly the orphan-corruption state we're avoiding. The only safe manual cleanup is hard-deleting an empty leaf folder (no descendants of any kind). The proper subtree-aware folder lifecycle lands in PRJ-796 (Wave 5) with a `getCountFromServer`-based UI check before delete.

**Manual red-team validation:** see `firestore-rules-validation.md` for the emulator test plan. Run before promoting rules to production. Automated coverage lands with PRJ-841.

## Project docs

- `CLAUDE.md` — project status, locked decisions, wave plan, dev workflow
- `.handoff.md` — session continuity
- `AGENTS.md` — code reviewer persona and product invariants
- `research/synthesis.md` — full architecture + UX lock document
- `research/discovery-*.md` — raw 7-LLM discovery reports

## Development workflow

All implementation goes through the `dev-workflow` skill. No direct coding.

- One sub-ticket = one branch = one PR (≤500 LOC).
- Context7 doc lookup required before coding with any library.
- Codex must APPROVE the PR before merge.
