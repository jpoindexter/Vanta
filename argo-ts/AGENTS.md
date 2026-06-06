# AGENTS.md — argo-ts (agent layer)

Cross-tool agent context. Pairs with `CLAUDE.md` (deeper detail). Read root `../AGENTS.md` for the kernel + project overview first.

## Runtime

Node 22, ESM, `"type": "module"`. Run via `tsx` (no build step). Native `fetch`, `process.loadEnvFile` — no dotenv, no axios. Relative imports use `.js` extensions (tsx resolves to `.ts`). TUI uses React/Ink 7.

## Test + typecheck

```bash
npx vitest run          # 1075 tests (from argo-ts/)
npx tsc --noEmit        # must be clean before any commit
```

## Key entry points

| Command | File |
|---------|------|
| `argo` (TUI) | `src/tui/launch.tsx` → `src/tui/app.tsx` |
| `argo` (readline fallback) | `src/interactive.ts` |
| `argo run "<instr>"` | `src/cli.ts` → `src/session.ts` → `src/agent.ts` |
| `argo gateway` | `src/gateway/run.ts` |
| `argo improve` / `argo factory` | `src/factory/run.ts` (autonomy ladder L1–L4) |

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

- **UX-MODEL-FIX** — `/model` choice not persisting across relaunch (regression; `UX-MODEL` marked shipped). Diagnose `setup.ts upsertEnv` + write path + launcher env precedence.
- **AUX-MAP** — generalize AUX-VISION (`routing/vision.ts`) to a per-function aux-task model map.
- **GOAL-ACTION** — auto-fire `repl/next.ts` micro-step on vague goals.
- **SCRUB-AI** — strip Hermes/Claude/other-agent mentions from the published surface before going public (keep research docs).
- *(The four 2026-06-04 drag-drop / vision-permission bugs are fixed — see ROADMAP.md.)*

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

`VANTA_PROVIDER` · `VANTA_MODEL` · `VANTA_KERNEL_URL` · `VANTA_HOME` · `VANTA_SELF_IMPROVE` · `VANTA_VISION_MODEL` / `VANTA_VISION_PROVIDER` (auxiliary vision routing) · `VANTA_FACTORY_BUDGET` · `VANTA_FACTORY_DISABLED` (factory kill switch)

Full env list: `CLAUDE.md §Env`.
