# AGENTS.md — Vanta (repo root)

Cross-tool agent context (Codex, Cursor, etc.). Pairs with `CLAUDE.md`. Read both. `CLAUDE.md` has deeper detail; this file has the essentials any agent needs to operate.

## What this repo is

Vanta is a local trusted-operator agent: Rust safety kernel + TypeScript agent loop. It knows its goals before picking tools, enforces scope on every action, and reports only verified output.

Two layers:

| Path | Language | Role |
|------|----------|------|
| `src/` | Rust | Safety kernel: risk classifier, approvals, goals, HTTP sidecar on :7788 |
| `vanta-ts/` | TypeScript, Node 22, ESM | Agent loop: LLM providers, 123 built-in tools (127 registered), 137 slash commands, TUI, REPL |

The kernel is the enforced security boundary — `assess()` blocks, it doesn't advise. Deep TS docs: `vanta-ts/AGENTS.md`.

## Build + test

```bash
cargo build && cargo test                     # Rust kernel (last recorded: 67 tests)
cd vanta-ts && npx vitest run && npx tsc --noEmit  # TS agent (last recorded full green: 11979 tests + typecheck)
./install.sh                                  # global `vanta` in ~/.local/bin
vanta                                          # launch TUI (TTY) or readline REPL
```

> **Status (2026-07-09):** v0.8.0 roadmap-grind in progress on `main`. Current source registers **123 built-in tools** (127 with factory `mount_mcp`/`tool_search`/`mcp_auth`/`run_pipeline`) and **137 slash commands**; last recorded full verify is **11979 TS tests green** (1070 files), `tsc` clean, size gate clean, plus **67 kernel tests**. Current direction and per-card status live in `roadmap.json`; the human launch-pad view is generated as `roadmap.html`. The local codegraph index lives in ignored `.codegraph/`; refresh it with `codegraph index -f .` and verify with `codegraph status .` before relying on code-intel results.

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

<!-- CODEGRAPH_START -->
## CodeGraph

In repositories indexed by CodeGraph (a `.codegraph/` directory exists at the repo root), reach for it BEFORE grep/find or reading files when you need to understand or locate code:

- **MCP tools** (when available): `codegraph_explore` answers most code questions in one call — the relevant symbols' verbatim source plus the call paths between them. `codegraph_node` returns one symbol's source + callers, or reads a whole file with line numbers. If the tools are listed but deferred, load them by name via tool search.
- **Shell** (always works): `codegraph explore "<symbol names or question>"` and `codegraph node <symbol-or-file>` print the same output.

If there is no `.codegraph/` directory, skip CodeGraph entirely — indexing is the user's decision.
<!-- CODEGRAPH_END -->
