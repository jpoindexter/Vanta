# CLAUDE.md — session

This folder contains shared post-turn/background lifecycle utilities re-exported by `src/session.ts`.

`prepare-helpers.ts` builds the run prompt context. It reads the approved `PROGRAM.md` tunable block, or `VANTA_PROGRAM_OVERRIDE` during meta-tune scoring, before calling `buildSystemPrompt`.

Conventions:
- Hooks must degrade quietly; failures should not interrupt the active turn.
- Long or external work should be forked when the feature requires non-blocking behavior.
- Keep public surfaces small because both CLI and interactive hosts import from `src/session.ts`.
