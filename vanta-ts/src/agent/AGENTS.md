# AGENTS.md — vanta-ts/src/agent

Agent-loop internals split out from `../agent.ts`. Keep this layer orchestrational: no provider-specific logic and no Rust-kernel policy changes here.

- `dispatch-tool.ts` runs plan gate → safety gate → PreToolUse hooks → tool execution → PostToolUse hooks → compression/offload.
- `dispatch-helpers.ts` owns safety-gate composition: kernel verdict first, user permission rules second, auto-mode classifier third. Kernel `block` is immovable.
- `permission-gate.test.ts` is the focused integration proof for that composition.
- Auto-mode policy belongs in `../permissions/`; this folder only applies its decision.
