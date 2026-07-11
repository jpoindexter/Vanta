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
