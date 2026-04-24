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
| Hosting | Cloudflare Pages (git-push deploy, static SPA) |
| Package manager | pnpm |

No SSR. No `firebase-admin`. No server-side anything — Firestore Security Rules are the entire authz surface.

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
- `pnpm test` — placeholder (no test framework yet; lands in a later ticket)

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

Cloudflare Pages watches `main`:

1. Open PR → CI runs typecheck + build.
2. Merge to `main` → Cloudflare Pages builds and deploys automatically.
3. Firestore rules and indexes deploy via Firebase CLI separately:
   ```bash
   firebase deploy --only firestore:rules,firestore:indexes
   ```

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

## Bundle size

First build (scaffold only, no Firebase wiring yet):

| File | Raw | Gzipped |
|---|---|---|
| `dist/index.html` | 0.60 kB | 0.35 kB |
| `dist/assets/index-*.css` | 8.04 kB | 2.60 kB |
| `dist/assets/index-*.js` | 287.13 kB | 91.78 kB |
| **Total `dist/`** | **~304 kB** | — |

Well under the Cloudflare Pages 25 MiB Worker-bundle limit (which doesn't apply to static SPAs, but we're tracking it anyway). Firebase client SDK dominates the JS chunk at this stage; feature-ticket bundles will grow modestly from here.

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
