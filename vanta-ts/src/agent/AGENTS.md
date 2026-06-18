# AGENTS.md — vanta-ts/src/agent

Agent-loop internals split out from `../agent.ts`. Keep this layer orchestrational: no provider-specific logic and no Rust-kernel policy changes here.

- `turn-loop.ts` owns `runTurn`: completion → tool-call dispatch → stop conditions; emits `PostToolBatch` and `MessageDisplay` shell-hook events from the central loop.
- `dispatch-tool.ts` runs plan gate → safety gate → `PreToolUse` hooks → tool execution → `PostToolUse`/`PostToolUseFailure` hooks → compression/offload.
- `dispatch-helpers.ts` owns safety-gate composition and emits `PermissionRequest`/`PermissionDenied` hook events. Kernel verdict first, user permission rules second, auto-mode classifier third. Kernel `block` is immovable.
- `tool-scope.ts` reduces exposed schemas per provider call; `tool_search` stays reachable so the full catalog is discoverable on demand.
- `permission-gate.test.ts` is the focused integration proof for that composition.
- Auto-mode policy belongs in `../permissions/`; this folder only applies its decision.
- Permission-mode shortcuts must stay narrow, explicit, and covered by regression tests.
