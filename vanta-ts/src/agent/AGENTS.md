# AGENTS.md — vanta-ts/src/agent

Agent-loop internals split out from `../agent.ts`. Keep this layer orchestrational: no provider-specific logic and no Rust-kernel policy changes here.

- `turn-loop.ts` owns `runTurn`: completion → tool-call dispatch → stop conditions; emits `PostToolBatch` and `MessageDisplay` shell-hook events from the central loop.
- `dispatch-tool.ts` runs plan gate → safety gate → `PreToolUse` hooks → tool execution → `PostToolUse`/`PostToolUseFailure` hooks → compression/offload.
- Tool-effect durability marks calls `pending` before dispatch and `started` immediately before tool code. Interrupted effect-capable calls recover as `unknown`; never infer success or retry a mutation blindly.
- Auto-compaction effectiveness is decided by the next real provider input-token count. Two above-trigger readings suppress further automatic passes for that conversation; manual `/compact` remains independent.
- Every completed session-bearing provider call writes a route-usage row from the route that actually served it. Preserve fallback depth and zero-cost local/included calls; never attribute the whole turn to only the selected primary provider.
- `dispatch-helpers.ts` owns safety-gate composition and emits `PermissionRequest`/`PermissionDenied` hook events. Kernel verdict first, user permission rules second, auto-mode classifier third. Kernel `block` is immovable.
- `tool-scope.ts` reduces exposed schemas per provider call; `tool_search` stays reachable and its result headings are carried into the next scope calculation so searched tools become callable with full schemas.
- `permission-gate.test.ts` is the focused integration proof for that composition.
- Auto-mode policy belongs in `../permissions/`; this folder only applies its decision.
- Permission-mode shortcuts must stay narrow, explicit, and covered by regression tests.
