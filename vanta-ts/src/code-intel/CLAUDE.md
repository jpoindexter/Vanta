# CLAUDE.md — code-intel

Code-intelligence layer. This directory is the whole boundary between Vanta and the external `codegraph` engine.

- `provider.ts`: port, result helpers, null provider, graceful-unavailable message.
- `codegraph.ts`: adapter around the `codegraph` CLI (`explore` for task context, `query`, `affected`, `index`).
- `index.ts`: resolver and adapter registry. Adding or removing an engine should be one adapter file plus one registry entry.
- Consumers should call the port only. Tools/factory/core must not import codegraph directly; `arch/boundaries.ts` enforces this with `code-intel-seam`.

Verification: `npx vitest run src/code-intel/code-intel.test.ts src/factory/code-intel-wiring.test.ts`, `npx tsc --noEmit`, and `codegraph status .` after refreshing the local index.
