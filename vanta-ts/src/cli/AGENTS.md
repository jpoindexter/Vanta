# AGENTS.md — vanta-ts/src/cli

Operational command modules extracted from `src/cli.ts` to keep the CLI entrypoint small.

- `lifecycle.ts` parses `--init` / `--init-only` / `--maintenance` and runs shell-hook lifecycle events.
- `output-callbacks.ts` keeps one-shot output callback selection out of `commands.ts`.
- Add new top-level operational commands here when they are not interactive slash commands.
- Keep handlers thin: parse command args, lazy-import the subsystem, call it.
- Preserve safety boundaries; never run risky work here outside the normal kernel-gated paths.
