# AGENTS.md — argo-ts (agent layer)

Cross-tool agent context. Pairs with `CLAUDE.md` (deeper detail). Read root `../AGENTS.md` for the kernel + project overview first.

## Runtime

Node 22, ESM, `"type": "module"`. Run via `tsx` (no build step). Native `fetch`, `process.loadEnvFile` — no dotenv, no axios. Relative imports use `.js` extensions (tsx resolves to `.ts`). TUI uses React/Ink 7.

## Test + typecheck

```bash
npx vitest run          # 512 tests (from argo-ts/)
npx tsc --noEmit        # must be clean before any commit
```

## Key entry points

| Command | File |
|---------|------|
| `argo` (TUI) | `src/tui/launch.tsx` → `src/tui/app.tsx` |
| `argo` (readline fallback) | `src/interactive.ts` |
| `argo run "<instr>"` | `src/cli.ts` → `src/session.ts` → `src/agent.ts` |
| `argo gateway` | `src/gateway/run.ts` |
| `argo improve` | `src/factory/run.ts` (O9 — not yet built) |

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
- BUT: the `line.startsWith("/")` guard at line 167 intercepts dropped absolute paths before `runUserTurn` → **known bug** (see `HANDOFF.md`).

## Known bugs pending fix (see HANDOFF.md for full root-cause)

1. Readline REPL: dropped `/`-prefixed file paths treated as slash commands.
2. `maybeDroppedImage` only handles image extensions — video drops (`.mov|.mp4`) not handled.
3. `look_at_screen`: wrong error message on first-run Screen Recording permission denial.
4. Agent incorrectly tells user "file access is scoped" when drag-drop bypasses scope.

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

`ARGO_PROVIDER` · `ARGO_MODEL` · `ARGO_KERNEL_URL` · `ARGO_HOME` · `ARGO_SELF_IMPROVE` · `ARGO_FACTORY_BUDGET` (O9, once built) · `ARGO_FACTORY_DISABLED` (O9 kill switch)

Full env list: `CLAUDE.md §Env`.
