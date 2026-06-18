# AGENTS.md — vanta-ts (agent layer)

Cross-tool agent context. Pairs with `CLAUDE.md` (deeper detail). Read root `../AGENTS.md` for the kernel + project overview first.

## Runtime

Node 22, ESM, `"type": "module"`. Run via `tsx` (no build step). Native `fetch`, `process.loadEnvFile` — no dotenv, no axios. Relative imports use `.js` extensions (tsx resolves to `.ts`). TUI uses React/Ink 7.

## Test + typecheck

```bash
npx vitest run                   # last full green: 3634 tests (from vanta-ts/)
npx vitest run <pattern>         # single test file or describe block
npx tsc --noEmit                 # must be clean before any commit
```

## Key entry points

| Command | File |
|---------|------|
| `vanta` (TUI) | `src/ui/launch.tsx` → `src/ui/app.tsx` by default; `VANTA_TUI=v2` → `src/ui/v2/app-v2.tsx` |
| `vanta` (readline fallback) | `src/interactive.ts` |
| `vanta run "<instr>"` | `src/cli.ts` → `src/cli/lifecycle.ts` → `src/session.ts` → `src/agent.ts` |
| `vanta gateway` | `src/gateway/run.ts` |
| `vanta agents` / `attach` / `logs` / `respawn` / `stop` / `rm` | `src/cli/agents-cmd.ts` over `src/team/tasks.ts` |
| `vanta desktop` | `src/desktop/server.ts` serving `desktop-app/dist/` |
| `vanta improve` / `vanta factory` | `src/factory/run.ts` (autonomy ladder L1–L4) |

## Critical files for new work

- `src/tools/all-tools.ts` — register every new tool in the `ALL_TOOLS` array here AND in `tools/tools.test.ts` sorted list (`index.ts` is now just `buildRegistry`)
- `src/tools/types.ts` — `Tool`, `ToolContext`, `ToolResult` shapes
- `src/safety-client.ts` — kernel bridge (assess/approvals/goals)
- `src/repl/catalog.ts` — canonical list of 98 slash commands for `/help`, TUI palette, and validation
- `src/repl/handlers.ts` — slash command dispatcher and handler registry
- `src/plugins/` — plugin framework: manifest parsing, enabled-plugin loading, `PluginContext`, and runtime plugin slash-command registry
- `src/effort.ts` / `src/providers/effort.ts` — effort-level parsing plus OpenAI reasoning_effort / Anthropic extended-thinking param mapping
- `src/repl/init-cmd.ts` — `/init`: generate `.claude/CLAUDE.md` from detected project context
- `src/repl/rewind-cmd.ts` + `src/sessions/file-checkpoint.ts` — `/rewind`: in-memory per-edit file checkpoints, max 20 snapshots
- `src/repl/hooks-cmd.ts` — `/hooks`: list/add/remove `.vanta/hooks.json` shell hooks
- `src/schedule/durable-cron.ts` + `src/tools/cron.ts` — durable `.vanta/scheduled_tasks.json` cron tasks plus legacy cron TSV compatibility
- `src/tools/structured-output.ts` + `src/agent/structured-output.ts` — synthetic `StructuredOutput` tool for SDK `outputSchema`
- `src/compress/reactive.ts` — reactive trimming for oversized tool results before the next model turn
- `src/cli/agents-cmd.ts` — background agent CLI management over `~/.vanta/team-tasks.jsonl`
- `src/permissions/auto-mode.ts` — auto permission classifier config and decision helper
- `src/modes/permission-mode.ts` — `default|acceptEdits|auto` mode parsing/env sync; acceptEdits bypasses the kernel only for six filesystem tools
- `src/permissions/request.ts` / `grant.ts` — typed approval dialog model plus allow/deny rule persistence helpers
- `src/setup/assistant.ts` — live first-run setup probes for provider, Google OAuth, MCP, and messaging; returns redacted `{ok, detail}` values.
- `src/operator-profile/profile.ts` — durable declared/inferred operator preferences plus tighten-only approval preference decisions
- `src/preferences/signals.ts` — `~/.vanta/preferences.jsonl` chosen-vs-rejected operator preference signal store
- `src/verify/completion-verifier.ts` — opt-in `VANTA_VERIFY=1` post-turn completion claim verifier; timeout-bound, logs pass, appends fail evidence as a system message
- `src/agent/tool-scope.ts` — per-turn task-relevant tool schema subset; full catalog reachable through `tool_search`
- `src/memory/guardrails.ts` — freshness/conflict/provenance labels for recalled memories
- `src/memory/extractor.ts` — opt-in `VANTA_EXTRACT_MEMORIES=1` post-turn fact extractor; JSON array only, deduped against brain entries, persists `semantic` facts with `auto-extracted` provenance
- `src/ralph/state.ts` — `.vanta/ralph-loop.json` continuity: ordered long-task features, paused startup block, `/goal resume|drop` support
- `src/cli/lifecycle.ts` — startup flags: `--init`, `--init-only`, `--maintenance`
- `src/sessions/store.ts` — session persistence plus `forkSession()` for `--fork-session`
- `src/ui/app.tsx` — Ink 7 TUI shell: `<Static>` transcript, composer, overlays, slash palette, approval UI
- `src/ui/focus.ts` — Tab/Shift+Tab focus traversal targets for composer, overlays, and approval actions
- `src/ui/v2/` — opt-in mission-control shell (`VANTA_TUI=v2`), wrapping the shared v1 engine in left/right operator rails
- `src/ui/reducer.ts` — pure transcript/UI reducer
- `src/ui/use-agent.ts` — agent I/O hook for the TUI
- `src/desktop/` + `desktop-app/` — localhost desktop API host + Vite/React renderer
- `src/interactive.ts` — readline REPL (fallback to TUI)

## Slash command / drop-file wiring

**TUI** (`src/ui/app.tsx`):
- Calls `maybeDroppedImage(line)` before the slash check → dropped image paths work.
- `/`-prefixed input that isn't a known command → routed through `executeSlash`.

**Readline REPL** (`src/interactive.ts`):
- Calls `runUserTurn(line)` → `maybeDroppedImage` inside `runUserTurn`.
- Slash handlers live in `repl/handlers.ts` (`HANDLERS` registry); `repl-commands.ts` re-exports `executeSlash`/`SLASH_COMMANDS`. TUI slash parsing/palette behavior is covered in `ui/slash.test.ts` and related `ui/use-*` tests.

## Current surface

- `src/tools/all-tools.ts` currently lists **88 built-in tools** (90 registered with factory `mount_mcp`/`tool_search`); runtime MCP mounts can add more.
- `src/repl/catalog.ts` currently exposes **98 slash commands**.
- Runtime plugins are opt-in via `settings.plugins.enabled`; loaded plugin tools are not built-ins and still route through the normal kernel-gated tool path.
- Effort levels are `low|medium|high|max`: CLI `--effort`, session `/effort <level>`, `settings.effortLevel`, and `VANTA_EFFORT_LEVEL`; footer shows non-medium effort.
- `self_repair` includes `sandbox_test {toolPath}` for pre-attach limb-tool verification; it only accepts `vanta-ts/src/tools/*.ts` paths and forces `VANTA_SANDBOX=1` through the shared sandbox wrapper.
- Background agent management lives in `src/cli/agents-cmd.ts`: `vanta agents`, top-level `attach/logs/respawn/stop/rm <id>`, and `vanta daemon status/stop` read and manage `~/.vanta/team-tasks.jsonl`; `disableAgentView` or `VANTA_DISABLE_AGENT_VIEW=1` gates the surface.
- Permission modes: `default`, `acceptEdits`, `auto`. `acceptEdits` skips the kernel only for `write_file`, `edit_file`, `read_file`, `mkdir`, `glob_files`, `grep_files`; `shell_cmd` stays on the normal flow. `auto` runs the classifier after kernel + permission rules via `--permission-mode auto`, `VANTA_AUTO_MODE=1`, or `settings.autoMode.enabled`.
- Operator profile preferences live in `~/.vanta/operator-profile.json` and are applied after kernel + rules + auto-mode. They can only preserve/escalate decisions; one-way doors always ask and kernel Block remains immovable.
- Preference signals live in `~/.vanta/preferences.jsonl`. Human approval/denial prompts append chosen-vs-rejected rows; kernel blocks and non-human auto/rule/profile decisions do not.
- Approval prompts are per-tool: bash/file edit/file write/web/computer/sandbox/skill request models feed both Ink and desktop dialogs; Always/Never persist tool-scoped rules.
- Tool schemas are scoped per turn when the registry is large; `tool_search` remains available and `VANTA_TOOL_SCOPE=0` restores full exposure.
- SDK runs with `outputSchema` inject a synthetic `StructuredOutput` tool and return the validated tool-call arguments as the structured result.
- Tool results larger than 40% of the provider context window are annotated and truncated before being appended back into the conversation.
- Recalled brain memories are guarded before use: stale/conflicting/weak-provenance entries are flagged as not-used hypotheses.
- Startup flags include `--init`, `--init-only`, `--maintenance`, and resume `--fork-session`.
- Ralph-loop continuity is project-scoped at `.vanta/ralph-loop.json`: fresh launches surface it as PAUSED, and `/goal resume|drop` explicitly activates or discards carried work.
- TUI rendering is real Ink 7 under `src/ui/`; v1 remains the default and `VANTA_TUI=v2` opts into the separate mission-control shell under `src/ui/v2/`. The old `src/tui/` render layer is gone. `src/tui/mission-control/cockpit-data.ts` is the only remaining `src/tui` code path and is data-only.
- TUI focus traversal lives in `src/ui/focus.ts`: Tab moves forward, Shift+Tab moves backward when multiple focus targets are visible; Shift+Tab still cycles mode when the composer is the only target.
- Desktop root serving is Vite-first: `npm run desktop:build` writes `desktop-app/dist/`, and `src/desktop/assets.ts` serves it before falling back to the small `page.ts` build notice.
- Reach layer lives under `src/reach/` with tools for RSS, Reddit, cookies, and channel health. Deferred channels are tracked as `REACH-*`.
- `vanta setup` now validates the provider before writing `.env`, offers Google OAuth, probes configured MCP servers by mounting/listing tools, and probes Telegram when configured; optional steps report exact fixes rather than fake enables.
- Operator rocks now include world, money, radar, team, life-search, self-repair, verification locks, and browser action surfaces. Remaining horizon: browser OS-level control.

## Adding a tool (checklist)

- [ ] `src/tools/<name>.ts` — export `const <name>Tool: Tool`
- [ ] Zod `safeParse` on all args
- [ ] `describeForSafety` returns the risk-relevant string (path/command, not content)
- [ ] Path args → `resolveInScope(arg, ctx.root)` — return `{ok:false}` if outside
- [ ] Add to the `ALL_TOOLS` array in `src/tools/all-tools.ts`
- [ ] Add tool name to sorted list in `src/tools/tools.test.ts`
- [ ] Co-located `src/tools/<name>.test.ts`
- [ ] `npx tsc --noEmit` clean

## Env vars (key ones)

`VANTA_PROVIDER` · `VANTA_MODEL` · `VANTA_EFFORT_LEVEL` · `VANTA_KERNEL_URL` · `VANTA_HOME` · `VANTA_SELF_IMPROVE` · `VANTA_VERIFY` (opt-in completion verifier) · `VANTA_EXTRACT_MEMORIES` (opt-in post-turn fact extraction) · `VANTA_VISION_MODEL` / `VANTA_VISION_PROVIDER` (auxiliary vision routing) · `VANTA_FACTORY_BUDGET` · `VANTA_FACTORY_DISABLED` (factory kill switch) · `VANTA_TOOL_RETRIES` · `VANTA_STALL_THRESHOLD` · `VANTA_MODE_DETECT` · `VANTA_AUTOHANDOFF` / `VANTA_AUTOHANDOFF_THRESHOLD` · `VANTA_GOAL_ACTION` · `VANTA_RELAUNCH` (set by run.sh; enables /restart) · `VANTA_BROWSER_DISABLED` · `VANTA_DISABLE_AGENT_VIEW` · `VANTA_PERMISSION_MODE` · `VANTA_AUTO_MODE` · `VANTA_EMBED_MODEL` · `VANTA_RESUME_MAX_AGE_MIN` · `VANTA_TUI` (`v2` opt-in mission-control shell)

Full env list: `CLAUDE.md §Env`.
