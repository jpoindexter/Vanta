# Cross-platform gateway service

Vanta can keep its gateway running as a user-owned background service on macOS,
Linux, and Windows. The same gateway and safety kernel run on every platform;
only the operating-system supervisor changes.

| Command | Behavior |
| --- | --- |
| `vanta up` | Install the platform artifact and start the gateway |
| `vanta restart` | Restart an installed gateway |
| `vanta stop` | Stop the gateway but preserve its installation |
| `vanta logs` | Print the latest 100 gateway log lines |
| `vanta status` | Show service state, stale state, and the normal health report |
| `vanta service uninstall` | Stop the service and remove only its Vanta-owned artifact |

macOS uses a launchd user agent in `~/Library/LaunchAgents`. Linux uses a
systemd user unit in `~/.config/systemd/user`. Windows uses a least-privilege
Task Scheduler task and keeps its source XML under `~/.vanta/service`.

Crash restart is rate-bounded to five-second intervals. systemd and Task
Scheduler stop after five failures in a five-minute window; launchd applies its
native throttle. Output from every supervisor is written to
`~/.vanta/gateway.log`.

`vanta status` reports an installed but inactive service as `stale yes`. Removal
checks a Vanta ownership marker before touching the artifact. If that marker is
missing, Vanta refuses removal instead of deleting an operator-managed service.

The native acceptance workflow is `.github/workflows/service-supervisor.yml`.
It runs the real install, restart, log, stop, stale-state, and uninstall path on
macOS, Ubuntu, and Windows and uploads a JSON receipt for each runner.
