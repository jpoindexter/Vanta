# CLAUDE.md — vanta-ts/src/agent

Focused map for extracted agent-loop helpers.

- `turn-loop.ts`: `runTurn` — the per-turn iteration loop (completion → tool calls → stop conditions). Extracted from `../agent.ts`.
- `dispatch-tool.ts`: single tool-call execution pipeline.
- `dispatch-helpers.ts`: `applySafetyGate`, retry, and output compression helpers. Safety order is fixed: Rust kernel → `permissions.tsv` tightening → auto-mode classifier if enabled.
- `tool-scope.ts`: per-turn schema subsetter; large registries expose a task-relevant subset plus `tool_search`, with full catalog reachable on demand or `VANTA_TOOL_SCOPE=0`.
- `permission-gate.test.ts`: regression tests for kernel immovability, permission tightening, and auto-mode ask handling.

Do not weaken a kernel `block`; every new gate can only keep or tighten the decision.
