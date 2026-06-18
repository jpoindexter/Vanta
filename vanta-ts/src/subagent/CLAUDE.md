# CLAUDE.md — subagent

`spawn.ts` is the subagent boundary. It creates a fresh `Conversation`, injects a single worker goal into the system prompt, runs the instruction, and returns only the `AgentOutcome` summary to the caller.

Sidechain rule: every worker run writes the full worker transcript to `.vanta/sidechains/<timestamp>-<uuid>.json` with `{version, goal, instruction, model, createdAt, outcome|error, messages}`. Do not inline full worker messages into parent tool output; delegate/swarm parents should stay summary-only.

Hooks: `SubagentStart` fires before prompt construction, and `SubagentStop` fires on success or error.
