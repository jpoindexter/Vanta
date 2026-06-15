# CLAUDE.md — session

This folder contains shared post-turn/background lifecycle utilities re-exported by `src/session.ts`.

Conventions:
- Hooks must degrade quietly; failures should not interrupt the active turn.
- Long or external work should be forked when the feature requires non-blocking behavior.
- Keep public surfaces small because both CLI and interactive hosts import from `src/session.ts`.
