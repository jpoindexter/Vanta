# AGENTS.md — vanta-ts/src/tools

Built-in tool implementations. Register new tools in the `ALL_TOOLS` array in `all-tools.ts` (not `index.ts`, which is now just `buildRegistry`) and `tools.test.ts`; every tool parses args at the LLM boundary and returns errors as values. `ALL_TOOLS` holds **88 built-in** tools; `buildRegistry` registers **90** (+ factory-built `mount_mcp`, `tool_search`).

- `brain.ts` recall output is memory-guarded: fresh/sourced/non-conflicting entries are marked usable, while stale/conflicting/weak-provenance entries are flagged not used.
- `cron.ts` owns `cron_create`/`cron_list`; durable tasks persist in `.vanta/scheduled_tasks.json`, non-durable compatibility remains in the legacy TSV store.
- `structured-output.ts` builds the synthetic `StructuredOutput` tool; it is injected per SDK run, not registered as a built-in tool.
- Path tools must use scope helpers; safety descriptions must include risk-relevant target/command only, not content.
- Multi-tool files split writers/runners under the size gate: `*-write.ts` (git/calendar/drive, `gmail-helpers.ts`) + `*-run.ts` (`team-run.ts`, `radar-scan.ts`, `browser-act-run.ts`) hold helpers the parent imports — edit those, not a parent copy.
- `bg-tasks.ts` sends `Notification` hooks through `term/notify.ts` when a background shell task appears idle at an interactive prompt.
- `shell-cmd.ts` uses the shared OS sandbox wrapper when either `VANTA_SANDBOX=1` or shell-only `VANTA_SHELL_SANDBOX=1` is set; background shell tasks are refused in sandbox mode.
- `tool-search.ts` returns `## tool_name` sections; `agent/tool-scope.ts` reads those headings so searched tools become callable with full schemas on the next model iteration.
- `delegate.ts` and `swarm.ts` return worker summaries only; full worker transcripts are persisted by `subagent/spawn.ts` under `.vanta/sidechains/`.
- `mount-mcp.ts` passes the active tool root into MCP client events so elicitation/notification hooks use the right `.vanta` directory.
- Tool count is tracked here + in root/vanta-ts docs; update all after registry changes.
