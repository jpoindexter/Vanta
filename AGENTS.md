# AGENTS.md — Vanta (repo root)

Cross-tool agent context (Codex, Cursor, etc.). Pairs with `CLAUDE.md`. Read both. `CLAUDE.md` has deeper detail; this file has the essentials any agent needs to operate.

## What this repo is

Vanta is a local trusted-operator agent: Rust safety kernel + TypeScript agent loop. It knows its goals before picking tools, enforces scope on every action, and reports only verified output.

Two layers:

| Path | Language | Role |
|------|----------|------|
| `src/` | Rust | Safety kernel: risk classifier, approvals, goals, HTTP sidecar on :7788 |
| `argo-ts/` | TypeScript, Node 22, ESM | Agent loop: LLM providers, 45 tools, TUI, REPL |

The kernel is the enforced security boundary — `assess()` blocks, it doesn't advise. Deep TS docs: `argo-ts/AGENTS.md`.

## Build + test

```bash
cargo build && cargo test                     # Rust kernel (27 tests)
cd argo-ts && npx vitest run && npx tsc --noEmit  # TS agent (1075 tests + typecheck)
./install.sh                                  # global `argo` in ~/.local/bin
argo                                          # launch TUI (TTY) or readline REPL
```

> **Status (2026-06-05):** v1 complete; live-dogfooding backlog open. Shipped today: TUI readability + AUX-VISION (`VANTA_VISION_MODEL` routes image tools to a dedicated vision model) + auto-install of the bundled skill library (incl. 14 `nd-*` skills) in `prepareRun`. Open in `roadmap.json`: AUX-MAP, UX-MODEL-FIX, GOAL-ACTION, SCRUB-AI; horizon: DESKTOP.

## Key files

- `MANIFESTO.md` — north star, hard lines, non-negotiable
- `ROADMAP.md` — build order, what's done, what's next
- `DECISIONS.md` — locked choices (append-only)
- `PARKED.md` — deferred ideas
- `HANDOFF.md` — cold-start context for new sessions
- `docs/superpowers/specs/` — approved design specs
- `docs/superpowers/plans/` — implementation plans

## Active branch

`feat/v1-hermes-parity` — all work happens here. Every slice: real code + co-located test + tsc/cargo clean + `git commit` + `git push`. No exceptions.

## Safety rules (non-negotiable)

- Kernel `src/*.rs` — never edit autonomously. Human approval required.
- `argo-ts/src/factory/*.ts` — same (once factory module exists).
- `MANIFESTO.md` — human-only, never modify.
- Never commit secrets, never `rm -rf`, never `git push --force` shared branches.

## Adding a TS tool

1. New file `argo-ts/src/tools/<name>.ts`, export a `Tool`.
2. Zod-parse args (`safeParse`) — it's an LLM boundary.
3. Path args → `resolveInScope`; return `{ok:false}` if outside.
4. Register in `argo-ts/src/tools/index.ts` AND add the name to the sorted list in `tools/tools.test.ts`.
5. Watch for import cycles with `tools/index.ts` (lazy-import `buildRegistry` if needed — see `swarm.ts`).

## Docs discipline

Every folder that gets modified gets/keeps a `CLAUDE.md` and an `AGENTS.md`. Read a folder's docs only when working in it (index, don't inject). Update `ROADMAP.md` checkboxes when completing a tracked item. Commit + push every slice.
