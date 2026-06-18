# AGENTS.md — vanta-ts/src/subagent

Subagent worker orchestration.

- `spawn.ts` builds an isolated worker conversation with a fresh system prompt and one scoped goal.
- Callers must pass a registry that already excludes recursive tools (`delegate`, and `swarm` when relevant).
- Worker outputs returned to parents stay summary-only via `AgentOutcome.finalText`; full worker transcripts persist under `.vanta/sidechains/*.json` for audit.
- `SubagentStart` and `SubagentStop` hooks fire around each worker run.
- Keep this layer provider-agnostic and kernel-neutral; worker tool calls still flow through the normal agent loop and safety gate.
