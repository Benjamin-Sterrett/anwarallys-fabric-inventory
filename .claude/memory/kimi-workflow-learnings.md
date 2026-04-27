# Kimi Workflow Learnings — Persistent

**Last updated:** 2026-04-26 (after shipping PRJ-880, completing Phase 2)
**Applies to:** Every Kimi dev-workflow session on this project

---

## 1. Read canonical queue FIRST (before any ticket work)

- `.kimi/ticket-order.md` is the source of truth. Read it at the start of every session.
- Do NOT pick up tickets not in the Kimi-assigned list. Claude-gated tickets (PRJ-892, PRJ-888, PRJ-796, PRJ-797, etc.) are off-limits even if they look easy.
- **Caveat (2026-04-26 session):** PRJ-893 was Claude-gated and I shipped it accidentally — not a deliberate pattern-recognition judgment. I was in cruise control and didn't check the gate list. **Rule:** when in doubt, ask the user before picking up a ticket. Don't assume "looks small" overrides the gate list.

## 2. Codex review — canonical method + fallback

- **Canonical method:** `scripts/codex-review-wrapper.sh --base main --inject-plan`
  - Injects severity policy into AGENTS.md so Codex reviews against the project's P1/P2/P3 thresholds
  - Appends `.implementation-plan.md` so Codex sees intent vs shipped
  - Diff-contamination guard: skips injection if branch modifies AGENTS.md
  - EXIT/INT/TERM trap restores AGENTS.md even if killed mid-review
  - First invocation may be slow (cold cache); cached subsequent runs should be faster
- **When wrapper times out:** Fallback is direct `codex exec` with explicit severity context:
  1. `git diff main...HEAD > /tmp/prjXXX-pr-diff.txt`
  2. `codex exec --full-auto "Review the diff in /tmp/prjXXX-pr-diff.txt. Follow ~/.codex/AGENTS.md output format. Per finding: SEVERITY|FILE:LINE|ISSUE|RECOMMENDATION. If no issues found, output ONLY: VERDICT: APPROVE / CONFIDENCE: 1.0 / JUSTIFICATION: No issues found. You MUST include the VERDICT line."`
- Always write diff to file first. Passing raw diff in the prompt truncates on large diffs.
- **Do NOT bypass the wrapper by default.** Use it every time. Only fall back on timeout.

## 3. Endgame sequence (muscle memory after 5+ tickets)

1. Run Codex review from worktree (not main repo)
2. State File Handoff: copy `.dw-state.json` + `.task-progress.json` to main repo
3. `_dw_clear_execution_context` on main repo state
4. Append lead APPROVE decision + `_dw_set_phase_completed "pr-review"`
5. Remove worktree: `git worktree remove /tmp/.../PRJ-XXX`
6. Merge: `gh pr merge <PR#> --squash --delete-branch`
7. Post-merge verify: `git fetch origin main && git log --oneline -3 origin/main && pnpm run build`
8. Update Linear → Done
9. Telegram notify
10. Clean state files: `rm -f .dw-state.json .task-progress.json`
11. Update `.kimi/ticket-order.md` immediately

## 4. Fast-track vs Standard path assessment

| Signal | Path |
|--------|------|
| Single file, ≤20 LOC, no new patterns | Fast |
| 2-3 files, mirrors existing pattern (e.g., `subscribeToX` like `subscribeToFolderChildren`) | Fast |
| New query helpers + route changes + doc comments | Standard |
| Touches safety-critical routes (`rolls-adjust.tsx`) | Standard (or Claude-gated) |
| Infra/CI changes | Standard (or Claude-gated) |

## 5. Teammate spawn behavior

- First spawn on a fresh repo is slow (~2-3 min) — reads all skill files, explores codebase.
- Subsequent spawns on the same repo are faster because the codebase context is warm.
- Stagger spawns by 30s if running multiple teammates (OAuth race #37520).

## 6. No rushing — workflow invariants

- User explicitly said: "don't rush and I don't want you to take shortcuts."
- This means: don't skip the Codex review gate, don't skip state handoff, don't skip tracker updates.
- Speed comes from repetition and muscle memory, not from skipping steps.

## 7. Tracker discipline

- Update `.kimi/ticket-order.md` immediately after merge. Do not batch updates.
- Use `~~strikethrough~~` + `✅ SHIPPED PR #XX` in the active list.
- Append to Shipped section with date, PR #, squash SHA, and short note.

## 8. Telegram resilience

- Bridge can disconnect. Retry once on failure before escalating.
- Keep messages concise — one merge notification per PR.
