# Vanta — Session Handoff (2026-06-14)

Cold-start context for the next thread. Read this + `CLAUDE.md` + `AGENTS.md` first.

## Start Here

- **Repo:** `/Users/jasonpoindexter/Documents/GitHub/_active/Vanta`
- **Branch:** `main`
- **Runtime:** Rust kernel in `src/`; TypeScript agent in `vanta-ts/` (Node 22, ESM, tsx)
- **Current source counts:** 89 built-in tools from `vanta-ts/src/tools/all-tools.ts` (91 registered incl. factory tools); 99 slash commands from `vanta-ts/src/repl/catalog.ts`
- **Bundled skills:** 43 shipped skills under `vanta-ts/skills-library/`; latest addition is `vanta-port-adapter` for new swappable capability seams.
- **Last recorded full verify:** 3721 TS tests green (477 files), `tsc` clean, kernel tests green (see `vanta-ts/CLAUDE.md` 2026-06-18 notes)

## Run + Verify

```bash
./run.sh                                   # interactive session; first run launches setup if needed
./run.sh setup                             # provider/model setup wizard
./run.sh doctor                            # kernel/provider/store health
./run.sh run "<instruction>"               # one-shot, kernel auto-starts

cargo build && cargo test
cd vanta-ts && npx vitest run && npx tsc --noEmit
```

## Current Architecture

- **Kernel:** `src/*.rs` is the enforced security boundary. Do not edit autonomously.
- **Agent loop:** `vanta-ts/src/agent.ts`, `session.ts`, `prompt.ts`, `providers/`, `safety-client.ts`.
- **Tools:** `vanta-ts/src/tools/index.ts` registers built-ins; runtime MCP mounts can add more.
- **Slash commands:** `vanta-ts/src/repl/catalog.ts` is canonical; handlers live in `vanta-ts/src/repl/handlers.ts` and related `*-cmd.ts` files.
- **Goal graph:** `vanta-ts/src/goals/deps.ts` stores `.vanta/goal-deps.json`; `/goal blocks`, `/goal blocked_by`, `/goal status`, `/goals`, and `vanta goals` render derived dependency state.
- **Runtime plugins:** `vanta-ts/src/plugins/` loads enabled `plugin.json` plugins from `~/.vanta/plugins`; plugin tools are normal kernel-gated tools and plugin slash commands live in the runtime command registry.
- **Hooks:** `vanta-ts/src/hooks/` owns `.vanta/hooks.json`; supported hook types are `command`/`shell`, `http`, `mcp_tool`, `prompt`, and `agent`, with shared `timeoutMs`, `once`, and `statusMessage`. `VANTA-HOOK-EVENTS` is shipped: all 30 hook events are schema-valid and have Vanta-owned firing points across lifecycle/session/tool/permission/compaction/config/worktree/fleet/subagent/file watcher/MCP notification/elicitation/stop-failure paths.
- **Subagents:** `vanta-ts/src/subagent/spawn.ts` runs isolated worker conversations. Parent tools (`delegate`, `swarm`, workflow agent nodes) receive only the worker `AgentOutcome` summary, while full worker transcripts persist as JSON sidechains under `.vanta/sidechains/`.
- **Sandbox:** `VANTA_SANDBOX=1` still enables OS sandboxing for shell/code paths; `VANTA_SHELL_SANDBOX=1` maps only `shell_cmd` into the same sandbox wrapper. `VANTA_SANDBOX_NET=1` allows network in either mode.
- **Project init:** `/init` writes `.claude/CLAUDE.md` for the current project; use `--print` to preview and `--force` to replace.
- **Lifecycle init:** `--init` runs Setup hooks before a session; `--init-only` runs Setup + SessionStart and exits; `--maintenance` adds maintenance context.
- **Session fork:** `resume <id> --fork-session` / `--resume <id> --fork-session` seeds a new session file from prior history and leaves the original intact.
- **TUI:** real Ink 7 render layer is `vanta-ts/src/ui/`; shared terminal helpers are `vanta-ts/src/term/`. Default v1 is `src/ui/app.tsx`; `VANTA_TUI=v2` opts into `src/ui/v2/app-v2.tsx` mission-control rails. The old render layer under `src/tui/` is gone; only `src/tui/mission-control/cockpit-data.ts` remains as data plumbing.
- **Desktop:** localhost host in `vanta-ts/src/desktop/` serves built Vite/React assets from `vanta-ts/desktop-app/dist/`; `page.ts` is only the fallback build notice. Approval-required actions still use the explicit pending-approval flow.
- **Permission UI:** `vanta-ts/src/permissions/request.ts` builds typed approval views (bash/file edit/file write/web/computer/sandbox/skill). TUI and desktop both render Allow once / Always allow / Deny / Never allow; always/never persist tool-scoped rules.
- **Harness guardrails:** `vanta-ts/src/memory/guardrails.ts` marks stale/conflicting/weak-provenance recalled memories as not-used hypotheses; `agent/tool-scope.ts` exposes task-relevant tool schemas per turn, and `tool_search` expands searched tool schemas into the next provider call.
- **Solutioning:** `solutioning-mode` is an installed operator mode: research -> ranked what-to-build recommendation with sources -> stop before build.
- **Factory:** `vanta-ts/src/factory/*.ts` is protected. Treat it like kernel-adjacent code.
- **Background agents:** `vanta-ts/src/cli/agents-cmd.ts` manages `~/.vanta/team-tasks.jsonl`: `vanta agents`, top-level `attach/logs/respawn/stop/rm <id>`, and `vanta daemon status/stop`. `disableAgentView` / `VANTA_DISABLE_AGENT_VIEW=1` disables the surface.
- **Auto permission mode:** `--permission-mode auto`, `VANTA_AUTO_MODE=1`, or `settings.autoMode.enabled` runs `vanta-ts/src/permissions/auto-mode.ts` after kernel + permission rules; `vanta auto-mode defaults/config` inspects classifier config.

## Recent Shipped Surface

- Real Ink 7 TUI rebuild with `<Static>` transcript, composer, overlays, Claude-style approval menu, context/loops/changes panels, goal status, no alternate screen, and opt-in TUI v2 mission-control rails.
- Vite/React desktop renderer under `vanta-ts/desktop-app/` with componentized session sidebar, chat thread, composer, and right rail; build via `npm run desktop:build`.
- `/init`, lifecycle init flags, and resume forking: `vanta-ts/src/repl/init-cmd.ts`, `vanta-ts/src/cli/lifecycle.ts`, `vanta-ts/src/sessions/store.ts`.
- Auto minimalism skill + `/auto`; plan-mode and task-boundary EF surfaces; 14 bundled `nd-*` skills.
- Opt-in runtime plugin framework: `plugins.enabled` loads local plugins with `register(ctx)` for tools + slash commands; disabled plugins do not import.
- Operator rocks: world model, Money OS, opportunity radar, background teams, life-search, self-repair compartments, verification locks, browser action body.
- Horizon depth: live radar web scan, local embeddings, approval-gated self-repair rollback + limb sandbox-test, teams live-spawn, background agent CLI management, auto permission mode.
- Reach layer: channel doctor, RSS, Reddit, cookie import; deferred reach channels tracked as `REACH-*`.
- Goal dependency graph: blockers/dependents over kernel goals with wake notices when a completed blocker unblocks a dependent.

## Current Open Edges

- Browser OS-level control beyond Playwright page actions.
- Deferred reach channels: Twitter, LinkedIn, podcast, V2EX, Bilibili, Xiaohongshu, Xueqiu.
- Live setup still requires external credentials/binaries for some surfaces: Playwright Chromium, API keys, Google OAuth, login cookies.

## Discipline

- One slice = real code + colocated tests + `tsc`/cargo clean + docs sync + commit + push.
- Every touched folder must have accurate `CLAUDE.md` and `AGENTS.md`.
- Use source-derived facts for counts and file maps; session notes are historical unless verified.
- Never edit `MANIFESTO.md`, `src/*.rs`, or `vanta-ts/src/factory/*.ts` without explicit human approval.
