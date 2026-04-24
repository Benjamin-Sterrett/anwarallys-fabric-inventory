---
name: Project philosophy — cheap, reliable, low-upkeep
description: Anwarallys Fabric Inventory is a portfolio project built cheap; prioritize reliability and zero-upkeep longevity, not polish or sophistication
type: project
originSessionId: c7893804-042b-4feb-a0d5-db26cada1a4b
---
Anwarallys Fabric Inventory is being built as a **portfolio showcase** — low budget, but must work well long-term.

**Why:** Benjamin is doing this cheap to build portfolio credibility. The client needs something they can use for years without Benjamin having to babysit it. No maintenance contract, no ongoing hand-holding.

**How to apply:**
- Reject overengineering aggressively — "lowest acceptable product" is already locked in CLAUDE.md, reinforce it when scope creeps.
- **Favor zero-ops infrastructure:** Firebase (no server to patch), Cloudflare Pages (git-push deploy), free tiers where possible. Never suggest anything that needs a cron, a VPS, a DB migration, or a rotating credential.
- **Favor boring, stable libraries** with long track records over shiny new ones. If a dep requires frequent updates to keep working, reject it.
- **No dependencies on Benjamin's availability.** Avoid anything that needs Benjamin to log in monthly, rotate a key, or manually redeploy. If a human has to do a task on a schedule, it's the wrong design.
- Polish and decorative UI are NOT goals. A reliable, ugly-but-clear UI beats a pretty one that confuses ESL staff.
- When faced with a tradeoff between "clever and minimal" vs "dumb and stable," pick dumb and stable.
