# CLAUDE.md — vanta-ts/src/agent

Focused map for extracted agent-loop helpers.

- `dispatch-tool.ts`: single tool-call execution pipeline.
- `dispatch-helpers.ts`: `applySafetyGate`, retry, and output compression helpers. Safety order is fixed: Rust kernel → `permissions.tsv` tightening → auto-mode classifier if enabled.
- `permission-gate.test.ts`: regression tests for kernel immovability, permission tightening, and auto-mode ask handling.

Do not weaken a kernel `block`; every new gate can only keep or tighten the decision.
