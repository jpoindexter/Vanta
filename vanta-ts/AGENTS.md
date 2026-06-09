# AGENTS.md — vanta-ts (agent layer)

Cross-tool agent context. Pairs with `CLAUDE.md` (deeper detail). Read root `../AGENTS.md` for the kernel + project overview first.

## Runtime

Node 22, ESM, `"type": "module"`. Run via `tsx` (no build step). Native `fetch`, `process.loadEnvFile` — no dotenv, no axios. Relative imports use `.js` extensions (tsx resolves to `.ts`). TUI uses React/Ink 7.

## Test + typecheck

```bash
npx vitest run                   # 1822 tests (from vanta-ts/)
npx vitest run <pattern>         # single test file or describe block
npx tsc --noEmit                 # must be clean before any commit
```

## Key entry points

| Command | File |
|---------|------|
| `vanta` (TUI) | `src/tui/launch.tsx` → `src/tui/app.tsx` |
| `vanta` (readline fallback) | `src/interactive.ts` |
| `vanta run "<instr>"` | `src/cli.ts` → `src/session.ts` → `src/agent.ts` |
| `vanta gateway` | `src/gateway/run.ts` |
| `vanta improve` / `vanta factory` | `src/factory/run.ts` (autonomy ladder L1–L4) |

## Critical files for new work

- `src/tools/index.ts` — register every new tool here AND in `tools/tools.test.ts` sorted list
- `src/tools/types.ts` — `Tool`, `ToolContext`, `ToolResult` shapes
- `src/safety-client.ts` — kernel bridge (assess/approvals/goals)
- `src/repl-commands.ts` — all `/` slash command handlers + `maybeDroppedImage`
- `src/tui/app.tsx` — TUI reducer + drag-drop + slash command wiring
- `src/interactive.ts` — readline REPL (fallback to TUI)

## Slash command / drop-file wiring

**TUI** (`src/tui/app.tsx`):
- Calls `maybeDroppedImage(line)` before the slash check → dropped image paths work.
- `/`-prefixed input that isn't a known command → routed through `executeSlash`.

**Readline REPL** (`src/interactive.ts`):
- Calls `runUserTurn(line)` → `maybeDroppedImage` inside `runUserTurn`.
- Slash handlers live in `repl/handlers.ts` (`HANDLERS` registry); `repl-commands.ts` re-exports `executeSlash`/`SLASH_COMMANDS`. The slash *execution* path is verified end-to-end (`tui/app.test.tsx` drives `/help`+Enter).

## Open bugs / in-flight (roadmap.json)

- **AUX-MAP** — generalize AUX-VISION (`routing/vision.ts`) to a per-function aux-task model map (vision · summarize · title · embed); AUTO-ROUTER absorbs it.
- **SCRUB-AI** — strip legacy agent mentions from the published surface before going public (keep research docs). ✅ SHIPPED 2026-06-09.
- **VOICE-NATURAL** — warmth substance is in prompt rule 10; **gated on Jason** (done = 3 before/after sample approvals).
- *(Recent ships: COMPRESS-NATIVE (in-house context compression, `src/compress/`), self-locating global launcher. 2026-06-07 batch: UX-MODEL-FIX, GOAL-ACTION, RESTART, TOOL-RETRY, BEHAVIOR-VOICE, STALL-UNBLOCK, ROADMAP-ADD, BUG-CAPTURE, HANDOFF-PACKET, COST-VISIBLE, MODE-DETECT, AUTO-HANDOFF, ACTION-PROOF — see roadmap.json + CLAUDE.md §"Session additions".)*

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

`VANTA_PROVIDER` · `VANTA_MODEL` · `VANTA_KERNEL_URL` · `VANTA_HOME` · `VANTA_SELF_IMPROVE` · `VANTA_VISION_MODEL` / `VANTA_VISION_PROVIDER` (auxiliary vision routing) · `VANTA_FACTORY_BUDGET` · `VANTA_FACTORY_DISABLED` (factory kill switch) · `VANTA_TOOL_RETRIES` · `VANTA_STALL_THRESHOLD` · `VANTA_MODE_DETECT` · `VANTA_AUTOHANDOFF` / `VANTA_AUTOHANDOFF_THRESHOLD` · `VANTA_GOAL_ACTION` · `VANTA_RELAUNCH` (set by run.sh; enables /restart)

Full env list: `CLAUDE.md §Env`.
