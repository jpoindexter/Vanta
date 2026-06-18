# CLAUDE.md — vanta-ts/src/tools

Tool layer. Tools are the execution boundary below the agent loop and above the Rust safety kernel.

- Add tool: new `tools/<name>.ts`, zod `safeParse`, scoped paths, `describeForSafety`, add to the `ALL_TOOLS` array in `all-tools.ts`, update `tools.test.ts`. `index.ts` is just `buildRegistry` (filters `ALL_TOOLS` by name + adds factory-built `mount_mcp`/`tool_search`).
- Tool count: **88 built-in** in `ALL_TOOLS`, **90 registered** (+ factory `mount_mcp` + `tool_search`). Update both numbers after a registry change.
- Big multi-tool files split their writers/runners to stay under the size gate: `*-write.ts` (git/calendar/drive write tools, `gmail-helpers.ts`) and `*-run.ts` (`team-run.ts`, `radar-scan.ts`, `browser-act-run.ts`) hold helpers the parent file imports — edit the helper, not a copy in the parent.
- `brain.ts`: read/write/list/remember/recall for `~/.vanta/brain`; recall uses `memory/guardrails.ts` before returning entries to the model.
- `bg-tasks.ts`: background shell tasks write `.vanta/bg-tasks/*`; stall detection calls `notify`, which can emit `Notification` hooks.
- `mount-mcp.ts`: runtime MCP mounts use `mcp/events.ts` so server notifications and elicitation are hook-visible.
- Keep outputs actionably small; compression/offload happens later in `agent/dispatch-tool.ts`.

Invariant: never weaken kernel `block`; tool-internal checks may only tighten or explain failures.
