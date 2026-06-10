# Design — CC-SANDBOX (OS sandbox for tool execution)

Status: **designed, ready to build** (2026-06-10). Priorities-doc #6. Security-critical — build as ONE vertical slice from this spec; don't improvise OS-isolation at the tail of a thread.

## Goal
Opt-in OS-level isolation for `shell_cmd` and `run_code` so a tool the agent runs cannot read/write outside the project's scope or reach the network unless allowed. Defense-in-depth *under* the kernel verdict + CC-DANGEROUS-PATHS + CC-PERMISSIONS — those decide *whether* to run; the sandbox bounds *what a run can touch*.

## The invariant
The sandbox only ever **TIGHTENS** — a sandboxed run can do strictly less than an unsandboxed one. It never grants access. Enabling it must never *expand* capability; worst case it over-restricts and a legit command fails loudly (then the user widens a zone or disables).

## Where it lives
A new `sandbox/` module that wraps the command at the execution seam, behind `VANTA_SANDBOX=1` (default OFF — opt-in):
- `tools/shell-cmd.ts` runs `execFile("sh", ["-c", command], {cwd, timeout, maxBuffer})`. Sandboxed: run `sandbox-exec -f <profile> sh -c <command>` (macOS) / `bwrap <args> -- sh -c <command>` (Linux).
- `tools/run-code.ts` wraps its interpreter invocation the same way.
Keep the unsandboxed path byte-identical when the flag is off.

## Backends
1. **macOS — `sandbox-exec` (Seatbelt).** Generate a `.sb` profile from the resolved zones:
   - `(version 1)` `(deny default)` then allow: process-exec, read most of the fs (or restrict to project + system libs — start permissive on *read*, strict on *write*), **write only** under the project root + `resolveWritableZones(env)`, deny `~/.ssh`/`~/.aws`/etc. (reuse the DANGEROUS_DIRS list), and `(deny network*)` unless `VANTA_SANDBOX_NET=1`. `sandbox-exec` is deprecated-but-functional; acceptable for an opt-in dev tool.
2. **Linux — `bwrap` (bubblewrap).** `--ro-bind / /` for read, `--bind <root> <root>` + `--bind <zone> <zone>` for writable zones, `--tmpfs /tmp`, `--unshare-net` unless net allowed, `--die-with-parent`.

## Pieces
1. `sandbox/profile.ts` (PURE — the testable core):
   - `buildSeatbeltProfile(root, writableZones, opts): string` — the `.sb` text.
   - `buildBwrapArgs(root, writableZones, opts): string[]` — the bwrap argv.
   - `detectBackend(platform): "seatbelt" | "bwrap" | null`.
   - `wrapCommand(backend, profileOrArgs, argv): { cmd: string; args: string[] }` — assemble the wrapped invocation.
2. `sandbox/run.ts` (thin): `maybeSandbox(env, root, baseCmd, baseArgs): { cmd, args, cleanup? }` — if `VANTA_SANDBOX` off or no backend → return base unchanged (+ a one-time warning if VANTA_SANDBOX=1 but no backend); else write the Seatbelt profile to a temp file (cleanup after) / build bwrap args, return the wrapped command.
3. Wire `maybeSandbox` into `shell-cmd.ts` + `run-code.ts` at the exec seam.

## Test plan
- `buildSeatbeltProfile` / `buildBwrapArgs`: assert writable zones are bound R/W, the project root is included, DANGEROUS_DIRS are denied, network denied unless opted in, and (the invariant) NOTHING outside zones is writable. Snapshot the generated profile/args.
- `detectBackend` per platform; `maybeSandbox` returns base unchanged when off / no backend.
- **Live (manual, can't unit-test):** under `VANTA_SANDBOX=1`, attempt `echo x > ~/Desktop/ok` (allowed, Desktop is a writable zone) vs `echo x > ~/.ssh/evil` and `cat ~/.ssh/id_rsa` (blocked) and `curl example.com` (blocked unless VANTA_SANDBOX_NET=1). Document these as the acceptance checks.

## Risks
- **Profile correctness** is the whole game — a too-loose profile defeats the purpose. Mitigate with explicit deny-default + zone-derived allows + the DANGEROUS_DIRS denies, and the manual escape checks above. Generate from the SAME zone helpers the file tools use so they can't drift.
- `sandbox-exec` deprecation warnings on macOS — cosmetic; still enforces.
- bwrap not installed on Linux → degrade to a clear "install bubblewrap" message (don't silently run unsandboxed when VANTA_SANDBOX=1 was explicitly requested — that would violate the user's intent; either refuse or warn loudly).

## Why not done this session
OS-specific + security-critical; the profile must be exactly right. Build it fresh from this spec with the manual escape checks as the gate. Pairs with the shipped CC-DANGEROUS-PATHS (same DANGEROUS_DIRS) and CC-PERMISSIONS.
