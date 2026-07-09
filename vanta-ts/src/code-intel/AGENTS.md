# AGENTS.md — vanta-ts/src/code-intel

Swappable code-intelligence port for symbol search, task context, affected tests, and index refresh.

- `provider.ts` defines the `CodeIntelProvider` port and `Result<T,E>` contract. Provider methods never throw across the boundary.
- `codegraph.ts` is the default adapter. It shells out to the installed `codegraph` CLI; it does not import or vendor the engine.
- `index.ts` is the only registration point. `VANTA_CODE_INTEL=none|off` returns the no-op provider; unknown ids fall back to codegraph.
- `.codegraph/` is ignored local state. Refresh with `codegraph index -f .`; verify with `codegraph status .`.
- Keep `code-intel-seam` green: nothing outside this adapter may depend on codegraph-specific APIs.
