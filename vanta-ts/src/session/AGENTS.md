# AGENTS.md — vanta-ts/src/session

Shared session setup and post-turn lifecycle helpers.

- `background-learning.ts` owns post-turn LLM forks such as self-improvement review, session memory, `VANTA_EXTRACT_MEMORIES` fact extraction, brain learning, critic, and completion verification.
- `ef-gates.ts` owns the post-turn executive-function detector gates (research, inhibit, set-shift, stall) — best-effort, re-exported via `after-turn.ts`.
- `prepare-helpers.ts` owns run-setup helpers (`loadPromptContext`, `injectResume`, `loadRuntimeExtensions`, `buildRunPrompt`, `loadRalphContinuity`) consumed by `src/session.ts prepareRun`; runtime MCP mounts receive the active repo root so MCP hook events resolve the same `.vanta/hooks.json` scope as the session.
- `loadPromptContext` reads `PROGRAM.md` unless `VANTA_PROGRAM_OVERRIDE` is set by the meta-tune eval runner.
- Keep these hooks gated, best-effort, and safe to call from both interactive and one-shot hosts.
- Do not move host-specific rendering concerns into this folder; pass callbacks or mutate the shared transcript deliberately.
