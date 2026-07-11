# AGENTS.md — vanta-ts/src/subagent

Subagent worker orchestration.

- `spawn.ts` builds an isolated worker conversation with a fresh system prompt and one scoped goal.
- A selected `promptPreset` is appended as a bounded role tier; it never replaces the standard Vanta prompt. Sidechains and hooks record the selected agent type.
- `agent-defs.ts` loads project `.vanta/agents`, compatible `.claude/agents`, then Vanta-home `agents`; project definitions win.
- Callers must pass a registry that already excludes recursive tools (`delegate`, and `swarm` when relevant).
- Worker outputs returned to parents stay summary-only via `AgentOutcome.finalText`; full worker transcripts persist under `.vanta/sidechains/*.json` for audit.
- `SubagentStart` and `SubagentStop` hooks fire around each worker run.
- Keep this layer provider-agnostic and kernel-neutral; worker tool calls still flow through the normal agent loop and safety gate.
