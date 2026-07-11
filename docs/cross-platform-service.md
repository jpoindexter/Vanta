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

Crash restart is rate-bounded. systemd uses five-second spacing and stops after
five failures in five minutes; Task Scheduler retries at one-minute intervals
up to five times; launchd applies its native throttle. Output is written to
`~/.vanta/gateway.log`.

`vanta status` reports an installed but inactive service as `stale yes`. Removal
checks a Vanta ownership marker before touching the artifact. If that marker is
missing, Vanta refuses removal instead of deleting an operator-managed service.

The native acceptance workflow is `.github/workflows/service-supervisor.yml`.
It runs install, restart, log, stop, stale-state, and uninstall and uploads a
JSON receipt. macOS is proven locally and in Actions.
GitHub Actions run 29166838401 also produced an `ok: true` Ubuntu systemd-user
receipt. The card is parked only on Windows acceptance: the hosted Windows
runner reports the InteractiveToken task as running without executing the owned
runner. Run `scripts/service-native-proof.ts` from a real logged-in Windows
desktop and require an `ok: true` receipt before treating Windows as released.
