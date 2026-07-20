# AGENTS.md — workflow

Declarative workflow graph core for agent pipelines.

Keep this folder pure and dependency-injected:
- `schema.ts` validates authorable graph specs and cross-node references.
- `diff.ts` canonicalizes graphs and returns stable diffs.
- `execute.ts` runs graph semantics with injected `assess`, `requestApproval`, and `runAgent` functions.
- `run-state.ts` owns the versioned state schema and declared node access rules.
- `run-state-store.ts` owns project-scoped locking, atomic commits, migration, and optimistic field conflicts.
- `execute-state.ts` connects the pure executor to optional durable state and restart recovery.
- `completion-contract.ts` owns typed terminal conditions and hard-budget declarations.
- `completion.ts` evaluates persisted evidence, cancellation, and deterministic stop reasons.

Do not import CLI, tool registry, provider resolution, or concrete subagent wiring here. Production wiring belongs in `src/tools/workflow.ts` or a command adapter so tests can exercise graph behavior without live models or network.

State-writing agent nodes return `{output,writes,artifacts}`. Never persist a credential value; graph fields of type `secret-ref` accept only an opaque `{secretRef}` object.

Evidence-producing agent nodes declare allowed evidence kinds and return executed evidence in the structured outcome. Model prose is not completion evidence. Never convert a loop cap into success; persist `exhausted` with the unmet condition and recovery action.
