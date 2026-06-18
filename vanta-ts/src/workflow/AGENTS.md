# AGENTS.md — workflow

Declarative workflow graph core for agent pipelines.

Keep this folder pure and dependency-injected:
- `schema.ts` validates authorable graph specs and cross-node references.
- `diff.ts` canonicalizes graphs and returns stable diffs.
- `execute.ts` runs graph semantics with injected `assess`, `requestApproval`, and `runAgent` functions.

Do not import CLI, tool registry, provider resolution, or concrete subagent wiring here. Production wiring belongs in `src/tools/workflow.ts` or a command adapter so tests can exercise graph behavior without live models or network.
