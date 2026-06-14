# AGENTS.md — vanta-ts (agent layer)

Cross-tool agent context. Pairs with `CLAUDE.md` (deeper detail). Read root `../AGENTS.md` for the kernel + project overview first.

## Runtime

Node 22, ESM, `"type": "module"`. Run via `tsx` (no build step). Native `fetch`, `process.loadEnvFile` — no dotenv, no axios. Relative imports use `.js` extensions (tsx resolves to `.ts`). TUI uses React/Ink 7.

## Test + typecheck

```bash
npx vitest run                   # last full green: 3266 tests (from vanta-ts/)
npx vitest run <pattern>         # single test file or describe block
npx tsc --noEmit                 # must be clean before any commit
```

## Key entry points

| Command | File |
|---------|------|
| `vanta` (TUI) | `src/ui/launch.tsx` → `src/ui/app.tsx` |
| `vanta` (readline fallback) | `src/interactive.ts` |
| `vanta run "<instr>"` | `src/cli.ts` → `src/cli/lifecycle.ts` → `src/session.ts` → `src/agent.ts` |
| `vanta gateway` | `src/gateway/run.ts` |
| `vanta agents` / `attach` / `logs` / `respawn` / `stop` / `rm` | `src/cli/agents-cmd.ts` over `src/team/tasks.ts` |
| `vanta improve` / `vanta factory` | `src/factory/run.ts` (autonomy ladder L1–L4) |

## Critical files for new work

- `src/tools/index.ts` — register every new tool here AND in `tools/tools.test.ts` sorted list
- `src/tools/types.ts` — `Tool`, `ToolContext`, `ToolResult` shapes
- `src/safety-client.ts` — kernel bridge (assess/approvals/goals)
- `src/repl/catalog.ts` — canonical list of 93 slash commands for `/help`, TUI palette, and validation
- `src/repl/handlers.ts` — slash command dispatcher and handler registry
- `src/repl/init-cmd.ts` — `/init`: generate `.claude/CLAUDE.md` from detected project context
- `src/cli/agents-cmd.ts` — background agent CLI management over `~/.vanta/team-tasks.jsonl`
- `src/permissions/auto-mode.ts` — auto permission classifier config and decision helper
- `src/cli/lifecycle.ts` — startup flags: `--init`, `--init-only`, `--maintenance`
- `src/sessions/store.ts` — session persistence plus `forkSession()` for `--fork-session`
- `src/ui/app.tsx` — Ink 7 TUI shell: `<Static>` transcript, composer, overlays, slash palette, approval UI
- `src/ui/reducer.ts` — pure transcript/UI reducer
- `src/ui/use-agent.ts` — agent I/O hook for the TUI
- `src/interactive.ts` — readline REPL (fallback to TUI)

## Slash command / drop-file wiring

**TUI** (`src/ui/app.tsx`):
- Calls `maybeDroppedImage(line)` before the slash check → dropped image paths work.
- `/`-prefixed input that isn't a known command → routed through `executeSlash`.

**Readline REPL** (`src/interactive.ts`):
- Calls `runUserTurn(line)` → `maybeDroppedImage` inside `runUserTurn`.
- Slash handlers live in `repl/handlers.ts` (`HANDLERS` registry); `repl-commands.ts` re-exports `executeSlash`/`SLASH_COMMANDS`. TUI slash parsing/palette behavior is covered in `ui/slash.test.ts` and related `ui/use-*` tests.

## Current surface

- `src/tools/index.ts` currently registers **81 built-in tools**; runtime MCP mounts can add more.
- `src/repl/catalog.ts` currently exposes **93 slash commands**.
- `self_repair` includes `sandbox_test {toolPath}` for pre-attach limb-tool verification; it only accepts `vanta-ts/src/tools/*.ts` paths and forces `VANTA_SANDBOX=1` through the shared sandbox wrapper.
- Background agent management lives in `src/cli/agents-cmd.ts`: `vanta agents`, top-level `attach/logs/respawn/stop/rm <id>`, and `vanta daemon status/stop` read and manage `~/.vanta/team-tasks.jsonl`; `disableAgentView` or `VANTA_DISABLE_AGENT_VIEW=1` gates the surface.
- Auto permission mode is opt-in: `--permission-mode auto`, `VANTA_AUTO_MODE=1`, or `settings.autoMode.enabled` runs the classifier after kernel + permission rules; `vanta auto-mode defaults|config` inspects rules.
- Startup flags include `--init`, `--init-only`, `--maintenance`, and resume `--fork-session`.
- TUI rendering is real Ink 7 under `src/ui/`; the old `src/tui/` render layer is gone. `src/tui/mission-control/cockpit-data.ts` is the only remaining `src/tui` code path and is data-only.
- Reach layer lives under `src/reach/` with tools for RSS, Reddit, cookies, and channel health. Deferred channels are tracked as `REACH-*`.
- Operator rocks now include world, money, radar, team, life-search, self-repair, verification locks, and browser action surfaces. Remaining horizon: browser OS-level control.

## Adding a tool (checklist)

- [ ] `src/tools/<name>.ts` — export `const <name>Tool: Tool`
- [ ] Zod `safeParse` on all args
- [ ] `describeForSafety` returns the risk-relevant string (path/command, not content)
- [ ] Path args → `resolveInScope(arg, ctx.root)` — return `{ok:false}` if outside
- [ ] Register in `src/tools/index.ts`
- [ ] Add tool name to sorted list in `src/tools/tools.test.ts`
- [ ] Co-located `src/tools/<name>.test.ts`
- [ ] `npx tsc --noEmit` clean

## Env vars (key ones)

`VANTA_PROVIDER` · `VANTA_MODEL` · `VANTA_KERNEL_URL` · `VANTA_HOME` · `VANTA_SELF_IMPROVE` · `VANTA_VISION_MODEL` / `VANTA_VISION_PROVIDER` (auxiliary vision routing) · `VANTA_FACTORY_BUDGET` · `VANTA_FACTORY_DISABLED` (factory kill switch) · `VANTA_TOOL_RETRIES` · `VANTA_STALL_THRESHOLD` · `VANTA_MODE_DETECT` · `VANTA_AUTOHANDOFF` / `VANTA_AUTOHANDOFF_THRESHOLD` · `VANTA_GOAL_ACTION` · `VANTA_RELAUNCH` (set by run.sh; enables /restart) · `VANTA_BROWSER_DISABLED` · `VANTA_DISABLE_AGENT_VIEW` · `VANTA_AUTO_MODE` · `VANTA_EMBED_MODEL` · `VANTA_RESUME_MAX_AGE_MIN`

Full env list: `CLAUDE.md §Env`.
