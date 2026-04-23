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

## Status

Wave 0 captured. Wave 1 (scaffold + data model) is next — see Linear for ticket breakdown.

## Getting started

TBD — tech stack is decided in Wave 1 DISCOVER.

## Project docs

- `CLAUDE.md` — project status, locked decisions, wave plan, dev workflow
- `.handoff.md` — session continuity
- `AGENTS.md` — code reviewer persona and product invariants
- `docs/plans/` — implementation plans per ticket
- `research/` — discovery research output

## Development

All implementation goes through the `dev-workflow` skill. No direct coding.

- One sub-ticket = one branch = one PR (≤500 LOC).
- Context7 doc lookup required before coding with any library.
- Codex must APPROVE the PR before merge.
