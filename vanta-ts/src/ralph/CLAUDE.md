# CLAUDE.md — `src/ralph`

Ralph-loop state is the durable handoff file for long tasks spanning fresh sessions. It lives under the project data dir as `.vanta/ralph-loop.json` and is read at startup as paused continuity.

## Contract

- `readRalphState(dataDir)` returns `null` for missing, malformed, or schema-invalid files.
- `writeRalphState(dataDir, state)` creates the data dir and writes pretty JSON.
- `selectNextIncompleteFeature(state)` returns the first ordered feature with `in_progress`, `pending`, or `blocked`.
- `formatRalphContinuityBlock(state)` must say `PAUSED` and include `/goal resume` + `/goal drop`.

Resume activation lives in `repl/goal-cmd.ts`; prompt/session wiring lives in `prompt.ts` and `session.ts`.
