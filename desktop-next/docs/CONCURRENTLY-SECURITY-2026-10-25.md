# Desktop command-runner dependency — 2026-10-25

Concurrently10.0.4→10.0.6 pulls shell-quote1.9.0→1.12.0 through its own pinned
dependency. Only those two package entries and the owning Desktop manifest
pin change. No override, suppression, forced audit-fix or feature deletion.

[Upstream release](https://github.com/open-cli-tools/concurrently/releases/tag/v10.0.6)
updates shell-quote; the
[advisory](https://github.com/ljharb/shell-quote/security/advisories/GHSA-pqg4-j6r4-53mv)
lists1.11.0 as patched. Upstream severity is High; npm labels this dependency
chain Critical. Do not conflate their severity sources.

## Executed narrow proof

Independent prepared snapshot at785ad203 with this exact patch:
`Vanta-backups/concurrently-security-candidate-20261025-x9O06E`.
Independent npm ci --ignore-scripts installed1035packages.

- Old quote generated a newline-bearing shell fragment after a comment token;
  inspected only, never passed to a shell.
- Two new tests pass: unsafe quote rejected as TypeError and ordinary quoting
  retained; actual concurrently CLI runs both harmless Node stdout commands.
- Renderer and Electron typechecks exit0. Initial partial-snapshot native
  typecheck lacked legacy inputs; exact committed helpers and a fresh compiler
  cache resolved it without changing source or relaxing the compiler.
- Fresh workspace audit31→29:0critical/15high/6moderate/8low. Only concurrently
  and shell-quote disappear; no new package findings.

This is used by the Desktop dev script, not shipped in the production runtime.
It is not a full dev-server startup, UI acceptance or installed-app behavior
claim. Other29Desktop findings, runtime/website and default-branch alerts remain;
security is not green. No CLI runtime dependency or owner policy change.

Follow-on Desktop Zod4 is accepted with audit28, recorded in
ZOD-SECURITY-2026-10-25.md; runtime Zod3/OpenAI5 remains separate. Current
installed executable745629c6 is recorded in PARALLEL-DELIVERY-2026-10-25.md.
Concurrently remains development tooling, not a bundled runtime feature.
