# CLAUDE.md — vanta-ts/src/tools

Tool layer. Tools are the execution boundary below the agent loop and above the Rust safety kernel.

- Add tool: new `tools/<name>.ts`, zod `safeParse`, scoped paths, `describeForSafety`, add to the `ALL_TOOLS` array in `all-tools.ts`, update `tools.test.ts`. `index.ts` is just `buildRegistry` (filters `ALL_TOOLS` by name + adds factory-built `mount_mcp`/`tool_search`).
- Tool count: **122 built-in** in `ALL_TOOLS`, **126 registered** (+ factory `mount_mcp` + `tool_search` + `mcp_auth`) — real-counted 2026-06-25 via `buildRegistry().schemas()` (added `agent_session`). Update both numbers after a registry change.
- Big multi-tool files split their writers/runners to stay under the size gate: `*-write.ts` (git/calendar/drive write tools, `gmail-helpers.ts`) and `*-run.ts` (`team-run.ts`, `radar-scan.ts`, `browser-act-run.ts`) hold helpers the parent file imports — edit the helper, not a copy in the parent.
- `brain.ts`: read/write/list/remember/recall for `~/.vanta/brain`; recall uses `memory/guardrails.ts` before returning entries to the model.
- `bg-tasks.ts`: background shell tasks write `.vanta/bg-tasks/*`; stall detection calls `notify`, which can emit `Notification` hooks.
- `shell-cmd.ts`: approved commands run normally by default; `VANTA_SANDBOX=1` or shell-only `VANTA_SHELL_SANDBOX=1` routes through `sandbox/run.ts`; background shell tasks are refused under sandboxing.
- `tool-search.ts`: search output is both human-readable and a schema-expansion signal; keep `## tool_name` headings stable because `agent/tool-scope.ts` uses them.
- `delegate.ts`/`swarm.ts`: parent-facing output stays summary-only; full worker transcripts are written by `subagent/spawn.ts` sidechains.
- `nl-assertions.ts`: agent-facing wrapper around the plain-English assertion judge; use `VANTA_ASSERTION_PROVIDER` / `VANTA_ASSERTION_MODEL` to route the evaluator separately.
- `mount-mcp.ts`: runtime MCP mounts use `mcp/events.ts` so server notifications and elicitation are hook-visible.
- Keep outputs actionably small; compression/offload happens later in `agent/dispatch-tool.ts`.

Invariant: never weaken kernel `block`; tool-internal checks may only tighten or explain failures.
