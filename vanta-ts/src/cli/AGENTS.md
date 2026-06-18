# AGENTS.md — vanta-ts/src/cli

Operational command modules extracted from `src/cli.ts` to keep the CLI entrypoint small.

- `lifecycle.ts` parses `--init` / `--init-only` / `--maintenance` and runs shell-hook lifecycle events.
- `agents-cmd.ts` exposes `~/.vanta/team-tasks.jsonl` as `vanta agents`, top-level `attach/logs/respawn/stop/rm`, and `vanta daemon status/stop`; it honors `disableAgentView` / `VANTA_DISABLE_AGENT_VIEW`.
- `fleet-cmd.ts` exposes `vanta fleet run/status/review/accept`; it stays thin over `src/fleet/`.
- `auto-mode-cmd.ts` prints built-in/effective auto permission classifier config.
- `auto-research-cmd.ts` exposes the numeric metric improvement loop and stays thin over `src/auto-research/`.
- `meta-tune-cmd.ts` exposes `vanta meta-tune instructions`; it stays thin over `src/meta-tune/` and approval-gates `PROGRAM.md` adoption.
- `permission-mode.ts` strips `--permission-mode auto|default` and sets `VANTA_AUTO_MODE`.
- `output-callbacks.ts` keeps one-shot output callback selection out of `commands.ts`.
- `startup.ts` owns bootstrap (`findRepoRoot`/`loadEnv`) + `startInteractive` (TTY-gated setup wizard, TUI/REPL select) + run-arg/startup-flag parsing — extracted from `cli.ts` to keep the entrypoint thin.
- `commands.ts` owns one-shot `vanta run` orchestration: start file-change hook watching, emit prompt/stop/failure hook events, and emit `CwdChanged` before `vanta room` runs inside a resolved room root.
- `memory-cmd.ts` / `skills-cmd.ts` / `hooks-cmd.ts` hold the `vanta memory` / `skills`+`skill` / `hooks` handlers.
- `ops.ts` holds gateway/service/MCP handlers; `ops-app.ts` the desktop/factory/pairing/config handlers it re-exports; `roadmap-cmd.ts` the roadmap one.
- `extra-cmds.ts` + `extra-cmds-2.ts` hold smaller handlers (plugins/taste/models/acp/proxy; ref/settings/brief).
- `loop-cmd.ts` owns loop CRUD; `loop-cmd-ops.ts` its state-mutation handlers (escalations/clear/pause/resume/kill/show).
- Add new top-level operational commands here when they are not interactive slash commands.
- Keep handlers thin: parse command args, lazy-import the subsystem, call it.
- Preserve safety boundaries; never run risky work here outside the normal kernel-gated paths.
