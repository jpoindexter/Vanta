# Argo — Handoff (2026-06-02)

Resume cold from this. Read `CLAUDE.md` (root) + `argo-ts/CLAUDE.md` first — they're the live source of truth (file maps, env, gotchas), kept current as phases landed.

## One-line state

**All 7 PRD phases are built, integrated, and green.** 16 Rust + 274 TS = **290 tests pass**, typecheck clean. The full agent loop is verified live on Ollama qwen2.5:14b.

## What this is

Argo = local trusted-operator agent. Lineage OpenClaw → Hermes → Argo. Rust safety kernel (enforced boundary, `src/`) + TypeScript agent layer (`argo-ts/`). Knows the goal before it picks a tool; gates every action through the kernel; reports only verified output. Full vision: `docs/prd.md`.

## Phases (all done)

- **1** — agent loop: providers (OpenAI/Ollama), 4 core tools, 3-tier prompt, context trim, kernel auto-start, `argo run`.
- **2A** — skills + memory: `~/.argo/skills/<slug>/SKILL.md`, `write_skill`/`recall`, curator, per-goal memory injected into the prompt, LLM context compression, `argo skills`/`skill`. Global store is git-versioned (verified live).
- **2B** — web search: `SearchProvider` (ddg/searxng/serpapi/brave), `web_search`/`web_fetch` (Readability). `web_fetch` verified live; DDG IP-blocked from datacenters.
- **3** — browser + vision: `screenshot`/`browser_navigate`/`browser_extract` (playwright-core + domain allowlist), `describe_image`.
- **4** — code/dev: `run_code` (approval-gated), `lsp_diagnostics`/`lsp_definition` (TS compiler API), 6 git tools, README context autodetect, full Anthropic provider.
- **6** — autonomous: cron scheduler (`argo schedule`/`cron`), subagent spawning (`delegate`, isolated workers), A2A local bus.
- **7** — digital person: project rooms (`argo room <name>`), 6 operator modes (skills), multi-model routing, mode learning.
- **5** — comms: Gmail/Calendar/Drive (10 tools, every outbound approval-gated), `argo auth google` (per-user OAuth).

**32 tools** registered. `buildRegistry({exclude:["delegate"]})` → 31 for workers.

## Test / verify

```bash
cd ~/Documents/GitHub/Argo
cargo test                                       # 16 pass
(cd argo-ts && npm test && npm run typecheck)    # 274 pass, clean
npm --prefix argo-ts run argo -- run "list my active goals"   # live loop (Ollama)
```

## What needs external setup for LIVE use (code is real + offline-tested)

See `PARKED.md`. Short version: browser → `npx playwright install chromium`; Anthropic/vision → API keys; comms → provision a Google OAuth client (`ARGO_GOOGLE_CLIENT_ID/SECRET`) then `argo auth google`. None block the built+tested code; they gate the live external round-trip.

## Locked decisions

See `DECISIONS.md` (git baseline, search-mirrors-providers, web-fetch deps, DDG fragility, global `~/.argo` store, skill/memory kernel-Allow classification). The skill/memory safety classification is flagged there for veto.

## Gotchas (will waste your time)

- Harness pins spawned cwd to the old `Nexarion Agent` path → `ARGO_ROOT` works around it; the TS launcher passes it.
- Stale binary on :7788 → `lsof -nP -iTCP:7788 -sTCP:LISTEN`, kill PID.
- `argo cron` needs an OS scheduler (launchd/cron) to fire; the due-logic is tested.
- Each phase is one git commit (`git log --oneline`) — clean rollback points.

## How to build from here

The 7 phases match `docs/prd.md`. Each was built as: write contracts → parallel build workflow → serial integrate → verify-and-repair gate → commit + update both CLAUDE.md. Repeat that shape for any new capability. Promote items from `PARKED.md`.
