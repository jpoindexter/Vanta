# Argo — Session Handoff (2026-06-03 v3)

Cold-start context for a fresh thread. Read this + `MANIFESTO.md` + `ROADMAP.md` first.

---

## Where things are

- **Repo:** `~/Documents/GitHub/Argo` (Rust kernel `src/*.rs`; TS agent `argo-ts/`).
- **Branch:** `feat/v1-hermes-parity` — **synced with origin, clean tree.**
- **Tests:** 554 TS (vitest) + 27 Rust = **581 green**; `tsc --noEmit` clean.
  - Run: `cd argo-ts && npx vitest run && npx tsc --noEmit` · `cd .. && cargo test`
- **Gotcha:** harness pins spawned cwd to old `Nexarion Agent` path. Real repo is `Argo/`. `ARGO_ROOT` env var is the fix.

## Source-of-truth docs

- `MANIFESTO.md` — north star, 8 hard lines, non-negotiable.
- `ROADMAP.md` — **fully updated this session** — all shipped items ticked, residual section current.
- `DECISIONS.md` — locked choices (append-only).
- `argo-ts/CLAUDE.md` + `argo-ts/AGENTS.md` — file map + env + tool-add checklist.
- `argo-ts/src/factory/CLAUDE.md` — factory module map + safety invariants.

---

## What shipped this session (2026-06-03)

**4 bug fixes** — dropped paths, video routing, screen permission hint, scope message (all committed, pushed).

**O9 dark factory — complete:**
- `src/safety.rs` — `is_protected_path` blocks writes to `src/*.rs`, `argo-ts/src/factory/*.ts`, `MANIFESTO.md`
- `argo-ts/src/factory/` — triage, planner, executor, verifier, run + tests
- `AGENT-MANIFESTO.md` at repo root (writable, not kernel-protected)
- `argo improve` + `argo factory [approve|status]` CLI
- Gateway: `__factory__` cron entries spawn detached child
- **Live verified:** `argo improve` triages → prints plan → exits clean. `argo factory approve` ran full cycle — verifier caught a bad model output and discarded it cleanly.

**ROADMAP** — all shipped items ticked, residual section current.

---

## Pending user request

**Strip Hermes mentions from the codebase.** User: "remove all hermes mention and comparison from the code base and git repo — that was only reference on how to build."

Before starting, confirm scope:
- Source code comments/strings — yes, strip
- `ROADMAP.md` / `DECISIONS.md` inline Hermes references — strip or redact
- `docs/hermes-*` files (`hermes-flows.md`, `hermes-map.html`, `hermes-model.html`, `docs/_hermes-recon/`) — delete or keep as non-public history?
- `docs/parity-audit.md` — redact or delete?

Start with source code (safe), ask about docs before deleting.

---

## Residual (non-blocking, demand-driven)

| Item | Size |
|------|------|
| S5 · Heartbeat selfhood | Small |
| E-eff2 · Prefer-local routing | Small |
| D2 · Skill bundles | Small — factory can do this |
| U2 · @-file mentions | Medium |
| B-v2 · Emergent brain | Open research |

---

## Gotchas

- Harness pins cwd to `Nexarion Agent` (empty artifact). Real repo: `~/Documents/GitHub/Argo`.
- Stale binary on :7788 — `lsof -nP -iTCP:7788 -sTCP:LISTEN` and kill.
- `tools/tools.test.ts` has a sorted tool-name list — new tools must be added there.
- Factory needs a frontier model for `argo factory approve` to produce correct code. qwen2.5:14b ran but broke a test. Gemini 2.5 Flash hit 429 during testing.
- `isTreeDirty` uses `--untracked-files=no` — untracked files don't block the factory.

---

## Continuation prompt

```
Resume Argo. Repo: ~/Documents/GitHub/Argo (TS agent in argo-ts/, branch feat/v1-hermes-parity, synced with origin). 581 tests green (27 Rust + 554 TS), tsc clean.

Status: v1 complete. O9 dark factory shipped and live-verified. ROADMAP fully updated.

Pending: strip all Hermes mentions from the codebase (user request). Before starting, confirm scope — does this include docs/hermes-* files and docs/_hermes-recon/? Or just source code and ROADMAP/DECISIONS inline references?

Gotcha: harness may start in ~/Documents/GitHub/Nexarion Agent (empty artifact dir). Real repo is ~/Documents/GitHub/Argo.
```
