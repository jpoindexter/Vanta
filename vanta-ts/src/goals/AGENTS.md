# AGENTS.md — goals

TS-side goal helpers layered over the Rust kernel goal ledger.

- `deps.ts` stores dependency edges in `.vanta/goal-deps.json`.
- Kernel goals remain the source of truth for `active`/`done`; this layer derives `blocked` graph state.
- Keep this folder pure/storage-oriented. Do not edit the Rust kernel for dependency behavior.
