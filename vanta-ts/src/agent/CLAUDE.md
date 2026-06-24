# CLAUDE.md — vanta-ts/src/agent

Focused map for extracted agent-loop helpers.

- `turn-loop.ts`: `runTurn` — the per-turn iteration loop (completion → tool calls → stop conditions). Emits `PostToolBatch` after resolved tool calls and `MessageDisplay` before assistant text display.
- `auto-continue.ts`: VANTA-AUTOCONTINUE — fixes premature stopping ("agentic laziness"). `shouldAutoContinue` decides whether a would-be "done" (text, no tool calls) should keep going: fires only when the model DID work this turn, isn't awaiting the user (clarify/ask_user/trailing `?`), and either announced more work (`looksUnfinished`) or — with `VANTA_VERIFY=1` — failed the completion verifier on a done-claim. Bounded by `VANTA_AUTOCONTINUE_MAX` (default 3; `VANTA_AUTOCONTINUE=0` disables) and the turn's maxIter.
- `dispatch-tool.ts`: single tool-call execution pipeline; emits `PostToolUse` and `PostToolUseFailure`.
- `dispatch-helpers.ts`: `applySafetyGate`, retry, and output compression helpers. Emits `PermissionRequest`/`PermissionDenied`. Safety order is fixed: Rust kernel → `permissions.tsv` tightening → auto-mode classifier if enabled.
- `tool-scope.ts`: deferred schema subsetter; large registries expose a task-relevant subset plus `tool_search`, and recent `tool_search` result headings expand full schemas on the next provider call. `VANTA_TOOL_SCOPE=0` restores full exposure.
- `permission-gate.test.ts`: regression tests for kernel immovability, permission tightening, and auto-mode ask handling.

Do not weaken a kernel `block`; every new gate can only keep or tighten the decision.
