# AGENTS.md — Vanta (repo root)

Cross-tool agent context (Codex, Cursor, etc.). Pairs with `CLAUDE.md`. Read both. `CLAUDE.md` has deeper detail; this file has the essentials any agent needs to operate.

## What this repo is

Vanta is a local trusted-operator agent: Rust safety kernel + TypeScript agent loop. It knows its goals before picking tools, enforces scope on every action, and reports only verified output.

Two layers:

| Path | Language | Role |
|------|----------|------|
| `src/` | Rust | Safety kernel: risk classifier, approvals, goals, HTTP sidecar on :7788 |
| `vanta-ts/` | TypeScript, Node 22, ESM | Agent loop: LLM providers, 81 built-in tools, 93 slash commands, TUI, REPL |

The kernel is the enforced security boundary — `assess()` blocks, it doesn't advise. Deep TS docs: `vanta-ts/AGENTS.md`.

## Build + test

```bash
cargo build && cargo test                     # Rust kernel (41 tests)
cd vanta-ts && npx vitest run && npx tsc --noEmit  # TS agent (last full green: 3251 tests + typecheck)
./install.sh                                  # global `vanta` in ~/.local/bin
vanta                                          # launch TUI (TTY) or readline REPL
```

> **Status (2026-06-14):** v0.2.0 roadmap-grind in progress on `main`. Current source registers **81 built-in tools** and **93 slash commands**; last recorded full verify is **3251 TS tests green**, `tsc` clean, plus kernel tests. Recent: real Ink 7 TUI on `src/ui/` + `src/term/`, `/init` project-context generation, lifecycle init flags (`--init`, `--init-only`, `--maintenance`), resume forking (`--fork-session`), auto minimalism, Claude-style approvals, operator rocks, reach layer, live radar scanning, local embeddings, self-repair rollback + limb sandbox-test, teams live-spawn, and background agent CLI management. Remaining horizon: browser OS-level control; deferred reach channels in `REACH-*`. Per-card detail in `roadmap.json`.

## Key files

- `MANIFESTO.md` — north star, hard lines, non-negotiable
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
4. Register in `vanta-ts/src/tools/index.ts` AND add the name to the sorted list in `tools/tools.test.ts`.
5. Watch for import cycles with `tools/index.ts` (lazy-import `buildRegistry` if needed — see `swarm.ts`).

## Docs discipline

Every folder that gets modified gets/keeps a `CLAUDE.md` and an `AGENTS.md`. Read a folder's docs only when working in it (index, don't inject). Update `ROADMAP.md` checkboxes when completing a tracked item. Commit + push every slice.
