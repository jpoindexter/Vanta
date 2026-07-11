# Cross-platform service supervisor

`vanta up`, `restart`, `stop`, `status`, `logs`, and uninstall use the native
per-user supervisor on macOS, Linux, and Windows:

- macOS: a Vanta-owned launchd agent.
- Linux: a Vanta-owned systemd user service.
- Windows: a least-privilege Task Scheduler task and owned PowerShell runner.

The native proof in `vanta-ts/scripts/service-native-proof.ts` installs an
isolated long-running fixture, verifies start and restart state, requires the
service marker in the configured log, stops it, checks stale-state reporting,
and uninstalls only Vanta-owned artifacts. Failures write status and bounded log
diagnostics to `.artifacts/service-proof-<platform>.json`.

Windows registration resolves the current user SID with `whoami` and writes it
into the task principal. Linux keeps its signal trap in the long-running shell
instead of replacing that shell with `exec`, which is required for hosted-runner
lifecycle proof.

Systemd assignment paths keep spaces literal instead of wrapping paths in quotes
or encoding spaces as `\\x20`; both forms become literal path bytes in these
directives. A quoted absolute `WorkingDirectory=` is therefore rejected as
non-absolute. The Linux lifecycle
receipt was executed under an Ubuntu 24.04 systemd user manager with a dedicated
non-root user and covered install, start, restart, log capture, stop, stale-state
reporting, and uninstall, including working and log paths containing spaces.
Windows remains the unexecuted native lifecycle gate.

## Windows proof gate

Run the lifecycle proof from PowerShell in a real logged-in Windows desktop
session:

```powershell
cd vanta-ts
npm ci
node --import tsx scripts/service-native-proof.ts
```

The expected receipt is `.artifacts/service-proof-win32.json` with `ok: true`.
GitHub-hosted Windows runners do not satisfy this gate: Task Scheduler reports
the `InteractiveToken` task as running (`0x41301`) and later terminated
(`0x41306`) without launching its action. Do not switch the production task to
S4U to make CI pass; S4U tasks cannot access the network or encrypted files.
