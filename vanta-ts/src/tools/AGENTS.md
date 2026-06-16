# AGENTS.md — vanta-ts/src/tools

Built-in tool implementations. Register new tools in the `ALL_TOOLS` array in `all-tools.ts` (not `index.ts`, which is now just `buildRegistry`) and `tools.test.ts`; every tool parses args at the LLM boundary and returns errors as values. `ALL_TOOLS` holds **84 built-in** tools; `buildRegistry` registers **86** (+ factory-built `mount_mcp`, `tool_search`).

- `brain.ts` recall output is memory-guarded: fresh/sourced/non-conflicting entries are marked usable, while stale/conflicting/weak-provenance entries are flagged not used.
- `cron.ts` owns `cron_create`/`cron_list`; durable tasks persist in `.vanta/scheduled_tasks.json`, non-durable compatibility remains in the legacy TSV store.
- `structured-output.ts` builds the synthetic `StructuredOutput` tool; it is injected per SDK run, not registered as a built-in tool.
- Path tools must use scope helpers; safety descriptions must include risk-relevant target/command only, not content.
- Multi-tool files split writers/runners under the size gate: `*-write.ts` (git/calendar/drive, `gmail-helpers.ts`) + `*-run.ts` (`team-run.ts`, `radar-scan.ts`, `browser-act-run.ts`) hold helpers the parent imports — edit those, not a parent copy.
- Tool count is tracked here + in root/vanta-ts docs; update all after registry changes.
