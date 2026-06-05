# AGENTS.md — argo-ts/src/cli

Operational command modules extracted from `src/cli.ts` to keep the CLI entrypoint small.

- Add new top-level operational commands here when they are not interactive slash commands.
- Keep handlers thin: parse command args, lazy-import the subsystem, call it.
- Preserve safety boundaries; never run risky work here outside the normal kernel-gated paths.
