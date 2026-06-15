# AGENTS.md — vanta-ts/src/session

Shared session setup and post-turn lifecycle helpers.

- `background-learning.ts` owns post-turn LLM forks such as self-improvement review, session memory, `VANTA_EXTRACT_MEMORIES` fact extraction, brain learning, critic, and completion verification.
- Keep these hooks gated, best-effort, and safe to call from both interactive and one-shot hosts.
- Do not move host-specific rendering concerns into this folder; pass callbacks or mutate the shared transcript deliberately.
