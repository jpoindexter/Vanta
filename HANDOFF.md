# Argo — Handoff (2026-06-02)

Resume cold from this. Read `CLAUDE.md` (root) + `argo-ts/CLAUDE.md` first — they're the source of truth and kept current by the `argo-context-sync` skill.

## One-line state

Phase 1 (goal-aware agent loop, kernel-gated) is **built, tested, and verified live**. 38 tests green. Next is Phase 2.

## What this is

Argo = local trusted-operator agent. Lineage OpenClaw → Hermes → Argo. Rust safety kernel (enforced boundary) + TypeScript agent layer. Knows the goal before it picks a tool; gates every action; reports only verified output. Full vision: `docs/prd.md`. Hermes reference map: `docs/hermes-map.html`.

## Completed this session

- Renamed Nexarion → Argo (folder, crate, data dir `.argo/`, docs). Repo now at `~/Documents/GitHub/Argo`.
- Cloned Hermes to `~/Documents/GitHub/_active/hermes-reference` (read-only) + CodeGraph-indexed it (78K nodes).
- Built `docs/hermes-map.html` — interactive Hermes architecture map (steal/improve/replace).
- Wrote full `docs/prd.md` — 7-phase roadmap; web search moved to Phase 2B (top Hermes ask, 95 reactions).
- Kernel additions: `ARGO_ROOT` env override; `POST /api/log` endpoint; `.nexarion→.argo` migration in `doctor`.
- Built entire `argo-ts/` agent layer: providers (OpenAI+Ollama), 4 tools, 3-tier prompt, context trimmer, kernel launcher, agent loop, CLI. 17 source files, 22 tests.
- Wrote `SOUL.md`, root + agent-layer `CLAUDE.md`, and the `argo-context-sync` skill.

## Test state

- `cargo test` → 16 pass
- `cd argo-ts && npm test` → 22 pass (incl. 3 live-kernel integration tests: block / ask-deny / allow)
- `npm run typecheck` → clean
- Verified live on Ollama qwen2.5:14b: list goals, read+summarize, destructive blocked, install refused.

## Locked decisions (don't re-litigate without new info)

- Stack: Rust kernel + TS agent. Provider-agnostic LLM interface; OpenAI+Ollama share one adapter (baseURL swap).
- Non-streaming provider in v0 (reliability; streaming fits behind interface later).
- No Anthropic stub — `resolveProvider` throws clear "Phase 4" error (no fake-value stubs).
- Kernel is the enforced boundary; TS never decides safety, it asks the kernel.
- Tools return errors-as-values, never throw across the loop.
- Skills/memory will be markdown + YAML, git-versioned (solves Hermes's backup gap for free).

## Gotchas (these will waste your time)

- Harness pins spawned-process cwd to the OLD `Nexarion Agent` path → that's why `ARGO_ROOT` exists. The TS launcher always passes it.
- A stale `nexarion-agent` binary may hold port 7788. If a kernel won't bind: `lsof -nP -iTCP:7788 -sTCP:LISTEN`, kill the PID.
- Leftover empty `../Nexarion Agent/` dir (harness artifact). Real repo is `Argo/`.
- vitest→esbuild dev-only audit warning; never shipped. Upgrade to vitest 4 someday.

## Next priorities (Phase 2)

1. **Phase 2A — Skills & memory.** `~/.argo/skills/<name>/SKILL.md`, `write-skill`/`recall` tools, curator, per-goal memory in volatile prompt tier. Replace trim-only context with LLM summarization.
2. **Phase 2B — Web search** (move fast, top demand). `SearchProvider` interface mirroring `LLMProvider`: DuckDuckGo default (no key), Searxng (self-host, privacy), SerpAPI/Brave opt-in. `web_search` + `web_fetch` tools.

PRD has the full spec for each. Run them as: Opus plans/reviews, Sonnet subagents implement slices.

## How to resume

```bash
cd ~/Documents/GitHub/Argo
cargo test && (cd argo-ts && npm test)     # confirm green baseline
cargo run -- goals add "Phase 2A: skills system"
# then build per docs/prd.md; run argo-context-sync skill after each slice
```

Plan file (this session's approved plan): `~/.claude/plans/fizzy-coalescing-pine.md`.
Recommend `/clear` + fresh thread to start Phase 2.
