# Handoff — Vanta, next session

Repo: `/Users/jasonpoindexter/Documents/GitHub/Vanta` · agent code in `argo-ts/`
Branch: `feat/v1-hermes-parity` (all work pushed) · **636 tests green (609 TS + 27 Rust), tsc clean**

## Shipped last session (all pushed)
- **MCP-3 serve** — Vanta as a kernel-gated MCP server (`mcp/server.ts`, `argo mcp serve`), live-verified.
- **Model persistence** — `/model` picker now writes `.env` by default (^g = session-only). `model-picker.tsx`.
- **Installer** — `bootstrap.sh` → clones to `~/argo` → `install.sh`; README one-liner (activates when repo goes public).
- **SCOPE-1 writable zones** — `write_file` writes outside repo into approval-gated zones (default `~/Desktop`+`~/Downloads`, `ARGO_WRITABLE_DIRS`). `tools/writable-zones.ts`.
- **SCOPE-2 readable zones** — `read_file` reads sibling repos (default = project parent dir + writable zones, `ARGO_READABLE_DIRS`). Same file.
- **O10 autonomy ladder L1–L4** — `factory/run.ts`: `resolveAutonomyLevel(sub,env)`; L1 suggest / L2 implement+stop / L3 commit / L4 push. `ARGO_AUTONOMY_LEVEL` (default 4). Kernel `is_protected_path` still blocks skeleton/brainstem at every level.

## NEXT TASK — TUI-SMOOTH (Core UX, captured in roadmap, NOT built)
The TUI is a firehose: `src/tui/transcript.tsx` renders every tool call AND result as its own dim row; `shortArgs`/`firstLine` only truncate, so busy turns = wall of text and raw junk (e.g. `/var/folders/.../NSIRD_screencaptureui_.../Screenshot.png`, JSON args) prints verbatim.

**Do this FIRST, in order:**
1. Invoke the **brainstorming skill** (design work — don't snap-edit).
2. Study the reference TUIs the user named: **Hashmark** (`~/Documents/GitHub/hashmark` — own repo, readable via SCOPE-2 now), plus recall **Conductor** / **Emdash** patterns.
3. Build in vertical slices — start with the highest-impact, lowest-risk:
   - **Slice A (kills the dumping):** per-tool pretty rendering — clean verbs + abbreviated paths (`screenshot → 📸 captured`, `read_file → 📖 …/tail`, `write_file → ✎ …/tail`), NOT raw JSON/temp paths. Collapse a tool's call+result into ONE line. All in `transcript.tsx` (pure `EntryLine` + a `prettyTool(name,args,output)` helper — unit-testable).
   - **Slice B:** group/collapse multi-tool turns + a live "working…" status that settles when done.
   - **Slice C:** visual hierarchy so it reads as a calm activity feed.

Done = a multi-tool turn reads as a calm grouped feed — no raw temp paths, no JSON dumps, no wall of rows. Render logic is pure → co-locate vitest tests (`transcript` already has render tests in `app.test.tsx`).

## Open loops
- **Set the model:** user is still on `qwen2.5:14b` (weak → clumsy). Recommend `argo setup` → `claude-code` + `claude-sonnet-4-6` (free via Claude sub; grey-area ToS per DECISIONS.md). Persists now.
- **Remaining roadmap (`roadmap.json` / ROADMAP.md):** TUI-SMOOTH (next) · O11 compartment tier map · O10b autonomy L5 (auto-merge + low-risk classifier) · SCOPE-2 follow-up (secret-filename read-guard for in-zone `.env`/keys).

## Conventions (don't re-derive — see CLAUDE.md, argo-ts/CLAUDE.md)
ESM `.js` imports · zod at boundaries · files <300/fns <50 · co-located `*.test.ts` · `npx vitest run && npx tsc --noEmit` must be clean before done · gitleaks pre-commit hook runs on every commit · commit on slice complete, push when asked · roadmap.json is the agent-ready source → `argo roadmap` builds the HTML view.
