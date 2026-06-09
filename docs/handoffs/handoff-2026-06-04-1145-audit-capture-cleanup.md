# Handoff — audit, vision reframe, research capture, refactor + repo cleanup
Generated: 2026-06-04 11:45
Project: Vanta · /Users/jasonpoindexter/Documents/GitHub/Vanta
Branch: feat/v1-hermes-parity (all pushed; tag v0.1.0 pushed)

## What Was Accomplished
**Shipped features (code, tested):**
- **O11** compartments — `factory/compartments.ts`: body-model autonomy tiers (skeleton/brainstem/limbs/reflexes/memory) cap how far the factory proceeds; run.ts clamps to the touched files' most-restrictive tier.
- **O10b** autonomy L5 auto-merge — `factory/merge.ts`: `assessMergeRisk` fails-closed through 3 gates (armed via `VANTA_AUTONOMY_ALLOW_MERGE` default OFF · safe target never main/master · low-risk limbs-only+no-dep/env+small-diff). MAX_AUTONOMY_LEVEL 4→5.
- **TUI-SMOOTH** — `tui/tool-display.ts`: per-tool clean verbs + `abbrevPath` (kills NSIRD temp-path/JSON firehose) + `partitionBlocks` grouping. Detail from ARGS not raw output.
- **Refactor (this session):** `repl-commands.ts` 486→38 (handler registry under `repl/{types,catalog,format,handlers}.ts`); `cli.ts` 460→286 (ops handlers → `cli/ops.ts`).

**Research + capture (docs + roadmap, NOT built — per Jason's capture-now/build-later pattern):**
- **4-way agent audit** → `audit.json`/`audit.html` (Vanta vs Hermes vs Goose vs Claude Code) + live issue triage + ND-vision filter (F1–F6).
- **Vision reframe** (DECISIONS.md + audit): full-capability operator, **executive-function-first, inclusive** (curb-cut effect) — not "an agent for ND people." Moat = follow-through. Brain identity already `neurodivergent-first`.
- **Self-repair architecture** → `docs/self-repair-architecture.md` + `SR` roadmap item (propose→differential-conformance→blue-green-swap→human-promote; immutable trust root).
- **Dynamic-workflows** skill → `vanta-ts/skills-library/agent-orchestration-workflows/` (from Thariq article).
- **Factory-evolution research** → `docs/factory-evolution.md` + 7 `FAC-*` items (studied OctopusGarden/StrongDM/Willison/Ouroboros/Five-Levels; adapt-not-copy).
- **TUI parity** → 12 `TUI-*` items (Claude Code/Codex/Gemini/Hermes gaps).
- **Kanban research** → `docs/kanban-roadmap-research.md` + `KANBAN` item.
- **Repo cleanup**: moved 9 loose root files → `docs/handoffs/` + `docs/reference/` (git mv, no deletes); removed bogus `~/Desktop/` dir. Tagged **v0.1.0**.

## Current State
- Build: tsc clean. Tests: **675 green** (648 TS + 27 Rust) — last full run before the doc-only commits.
- Uncommitted changes: NONE. Working tree clean, all pushed.
- Roadmap: 77 items. `roadmap.json` (source, committed) → `roadmap.html` (gitignored, regenerate via `vanta roadmap` or the build).

## In Progress
None. Every thread was committed + pushed. This session was ~14 user goals, mostly research→capture.

## Blocked / Needs Decision
- **Build prioritization.** The `next` lane has 11 items (below) — that's a captured backlog, not a plan. Jason said "we'll prioritize what to build when we get there." Pick ONE to build first when ready (recommendation: `FAC-BORNSMALL` or `ND2 clarify` — both small, both prove the thesis).

## Key Decisions Made (and Why)
1. **Vision = EF-first inclusive, not ND-only** (DECISIONS.md 2026-06-04). Capability is table stakes; follow-through is the moat. Sharpens WHY without narrowing scope.
2. **L5 auto-merge ships OFF by default** — git lifecycle bypasses the kernel, so the classifier is the whole safety story; arm explicitly.
3. **Capture-not-build** — roadmap is the backlog; research lands as items + docs, build is a separate deliberate step (see memory `external-refs-and-capture`).
4. **Cut, deliberately:** full L5 black-box autonomy (anti-ND/anti-kernel), Digital Twin Universe, probabilistic scoring on deterministic gates, heavy spec ceremony.
5. **Repo cleanup kept wired/standard/planning files at root** (CLAUDE.md/AGENTS.md/README read by prompt; MANIFESTO kernel-protected; HANDOFF.md wired; DECISIONS/PARKED/ROADMAP/SOUL per convention).

## Exact Next Steps (in order)
1. [ ] Decide the ONE next build (see Blocked). Put one card in "building" — dogfood the WIP limit.
2. [ ] If `FAC-BORNSMALL`: follow `docs/factory-evolution.md` Slice 1 — pure `checkNewFilesUnderLineLimit` (NEW files only) in `factory/verifier.ts` + `vanta-ts/CONVENTIONS.md`. Test-first (`verifier.test.ts`), tsc, full suite green, commit+push.
3. [ ] Set the live model — still on the ollama/qwen seed; `vanta setup` → claude-code/sonnet for real runs.

## Context That's Easy to Lose
- **Jason's working style (in his CLAUDE.md):** over-engineers/doesn't-ship; anti-drift is rule #1; push back on his scope creep by name. This session had ~14 goal additions — that bounce IS the pattern the product (KANBAN WIP limit, ND items) is meant to fix. Capture is fine; building must stay one-at-a-time.
- **`roadmap.html`/`audit.html` are gitignored** generated views; `roadmap.json`/`audit.json` are the committed agent-ready source. Regenerate html locally; not on GitHub.
- **`factory/*.ts` is kernel-protected (skeleton)** — the factory can't edit itself; those slices are human-authored. The kernel (`src/safety.rs`) and `MANIFESTO.md` are also protected.
- **Generators hardcode repoRoot** — don't move `roadmap/audit .json+.html` out of root.
- **Memory written this session:** `external-refs-and-capture` (own analysis of external refs + capture-backlog preference). Index: `~/.claude/projects/-Users-jasonpoindexter-Documents-GitHub-Vanta/memory/MEMORY.md`.
- Commit cadence: every slice committed + pushed; gitleaks pre-commit hook runs.

## Continuation Prompt
Paste into a new session to resume:

---
Resuming Vanta — /Users/jasonpoindexter/Documents/GitHub/Vanta, branch feat/v1-hermes-parity (clean, pushed, tag v0.1.0). Vanta = local trusted-operator agent: Rust safety kernel (`src/`) + TS agent layer (`vanta-ts/`, Node22/ESM/tsx). Read root CLAUDE.md + vanta-ts/CLAUDE.md + the 5 planning docs first.

Last session shipped O11 (compartment autonomy tiers), O10b (L5 auto-merge, off by default), TUI-SMOOTH (clean activity feed), refactored repl-commands.ts→registry + cli.ts→cli/ops.ts, did a 4-way agent audit (audit.html), reframed the vision (executive-function-first/inclusive — see DECISIONS.md), and captured a large research backlog into roadmap.json (77 items): FAC-* (factory hardening — see docs/factory-evolution.md), TUI-* (TUI parity), ND1-6 (executive-function spine), SR (self-repair), KANBAN. Nothing from the research was built — it's a capture backlog by design.

675 tests green (648 TS + 27 Rust), tsc clean. Conventions: ESM .js imports, zod at boundaries, files ≤300/functions ≤50, co-located *.test.ts, `npx vitest run && npx tsc --noEmit` clean before done, gitleaks pre-commit, roadmap.json→roadmap.html via the generator (html is gitignored). factory/*.ts + src/*.rs + MANIFESTO.md are kernel-protected (human-authored only).

My next task: pick ONE roadmap item to build end-to-end (recommended: FAC-BORNSMALL — see docs/factory-evolution.md Slice 1 — or ND2 clarify). Confirm which with me, then build it test-first, one slice, commit+push. Respect anti-drift: one thing at a time, push back if I start adding scope mid-build.
---
