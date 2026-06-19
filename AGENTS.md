# AGENTS.md — Vanta (repo root)

Cross-tool agent context (Codex, Cursor, etc.). Pairs with `CLAUDE.md`. Read both. `CLAUDE.md` has deeper detail; this file has the essentials any agent needs to operate.

## What this repo is

Vanta is a local trusted-operator agent: Rust safety kernel + TypeScript agent loop. It knows its goals before picking tools, enforces scope on every action, and reports only verified output.

Two layers:

| Path | Language | Role |
|------|----------|------|
| `src/` | Rust | Safety kernel: risk classifier, approvals, goals, HTTP sidecar on :7788 |
| `vanta-ts/` | TypeScript, Node 22, ESM | Agent loop: LLM providers, 92 built-in tools (95 registered), 101 slash commands, TUI, REPL |

The kernel is the enforced security boundary — `assess()` blocks, it doesn't advise. Deep TS docs: `vanta-ts/AGENTS.md`.

## Build + test

```bash
cargo build && cargo test                     # Rust kernel (53 tests)
cd vanta-ts && npx vitest run && npx tsc --noEmit  # TS agent (last full green: 4132 tests + typecheck)
./install.sh                                  # global `vanta` in ~/.local/bin
vanta                                          # launch TUI (TTY) or readline REPL
```

> **Status (2026-06-19):** v0.2.0 roadmap-grind in progress on `main`. Current source registers **92 built-in tools** (95 with factory `mount_mcp`/`tool_search`) and **101 slash commands**; last recorded full verify is **4132 TS tests green** (520 files), `tsc` clean, plus **53 kernel tests**. A size-gate refactor split oversized TS files (all editable TS now ≤300 lines; only `factory/*` exempt). Recent: real Ink 7 TUI on `src/ui/` + `src/term/`, Tab/Shift+Tab focus traversal, opt-in TUI v2 mission-control shell (`VANTA_TUI=v2`), Vite/React desktop renderer (`desktop-app/`), per-tool permission request UIs, operator profile preferences, preference-signal capture, Ralph-loop filesystem continuity, goal dependency graph state (`.vanta/goal-deps.json`, `/goal blocks`, `vanta goals`), scoped wake context for cron/webhook/loop runs plus queued `approval.resolved` loop wakes, hook type parity (`command`/`http`/`mcp_tool`/`prompt`/`agent`), full worker-backed `agent` hooks on live REPL/tool events, `VANTA-HOOK-EVENTS` shipped with all 30 event names wired to Vanta-owned lifecycle/session/tool/MCP/file/worktree/fleet owners, paper hook parity covering the arXiv 27-event taxonomy with Vanta's three deliberate extras, deferred tool schemas where `tool_search` expands callable schemas on demand, subagent sidechain transcripts under `.vanta/sidechains`, shell-only OS sandbox mode (`VANTA_SHELL_SANDBOX=1`), `/verify` deterministic visual close-out requirements, plain-English assertion judging via `nl_assertions`, bundled `vanta-port-adapter` architecture skill, memory guardrails, public LongMemEval/LoCoMo memory recall benchmark runner, parallel worktree fleet command, FABRO declarative workflow graphs behind `compose_workflow`, `/recover` failure-mode triage, auto-research metric improvement loop, meta-tuned `PROGRAM.md` instruction surface, per-task tool scoping, solutioning mode, opt-in runtime plugin framework, `/init` project-context generation, `/rewind`, `/hooks`, durable cron tasks, structured-output SDK tool calls, reactive compaction for oversized tool results, context-length compact retry, lifecycle init flags (`--init`, `--init-only`, `--maintenance`), resume forking (`--fork-session`), auto minimalism, Claude-style approvals, operator rocks, reach layer, live radar scanning, local embeddings, self-repair rollback + limb sandbox-test, teams live-spawn, background agent CLI management, auto/acceptEdits permission modes, session effort levels, and setup assistant live probes for provider/Google/MCP/messaging. Remaining horizon: browser OS-level control; deferred reach channels in `REACH-*`. Per-card detail in `roadmap.json`.

## Key files

- `MANIFESTO.md` — north star, hard lines, non-negotiable
- `PROGRAM.md` — bounded tunable harness instruction block scored by `vanta meta-tune instructions`
- `ROADMAP.md` — build order, what's done, what's next
- `DECISIONS.md` — locked choices (append-only)
- `PARKED.md` — deferred ideas
- `HANDOFF.md` — current cold-start snapshot for new sessions
- `docs/superpowers/specs/` — approved design specs
- `docs/superpowers/plans/` — implementation plans

## Active branch

`main` — all work happens here. Every slice: real code + co-located test + tsc/cargo clean + `git commit` + `git push`. No exceptions.

## Safety rules (non-negotiable)

- Kernel `src/*.rs` — never edit autonomously. Human approval required.
- `vanta-ts/src/factory/*.ts` — same.
- `MANIFESTO.md` — human-only, never modify.
- Never commit secrets, never `rm -rf`, never `git push --force` shared branches.

## Adding a TS tool

1. New file `vanta-ts/src/tools/<name>.ts`, export a `Tool`.
2. Zod-parse args (`safeParse`) — it's an LLM boundary.
3. Path args → `resolveInScope`; return `{ok:false}` if outside.
4. Add it to the `ALL_TOOLS` array in `vanta-ts/src/tools/all-tools.ts` AND add the name to the sorted list in `tools/tools.test.ts`. (`index.ts` is now just `buildRegistry`, which filters `ALL_TOOLS` + adds factory `mount_mcp`/`tool_search`.)
5. Watch for import cycles with `tools/index.ts` (lazy-import `buildRegistry` if needed — see `swarm.ts`).

## Docs discipline

Every folder that gets modified gets/keeps a `CLAUDE.md` and an `AGENTS.md`. Read a folder's docs only when working in it (index, don't inject). Update `ROADMAP.md` checkboxes when completing a tracked item. Commit + push every slice.
