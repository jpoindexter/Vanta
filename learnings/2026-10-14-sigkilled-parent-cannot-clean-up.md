# A SIGKILLed parent cannot clean up, so a child must watch it

Date: 2026-10-14 · Area: process lifecycle / desktop runtime

Vanta's runtime started `vanta-kernel` as a child and relied on a Node `exit` hook (and signal handlers) to stop it.
Those hooks only run if the process gets to run JavaScript. SIGKILL (Force Quit, `kill -9`, an OOM kill, a crashed Electron
parent) gives the process no chance to run anything, so the kernel was reparented to launchd and lived forever; 164 piled up.
Measured with real processes: SIGTERM, SIGINT, SIGHUP, SIGKILL and "parent SIGKILLed" each left 1 to 2 survivors.

Why the first instinct fails: handlers on the parent are the wrong place for the guarantee. The guarantee has to live in a
process that is still alive when the parent is not.

## Pattern

1. **Guard process between runtime and kernel.** The runtime spawns a small inline Node script (`kernel-guard/guard-source.ts`),
   which spawns the kernel. The guard is a normal child (not detached) so it stays in the runtime's tree, but its only job is
   to outlive nothing: it polls `process.ppid !== supervisor` and `kill(supervisor, 0)` every second and SIGTERMs (then SIGKILLs) the kernel when
   the supervisor is gone, then exits. Cost: at most about one poll interval after a SIGKILL. The same polling `watchParentExit` makes the
   runtime end when its Electron shell is SIGKILLed.
2. **Record ownership on disk.** The guard writes `run/kernel-<port>.json` (Zod: kernel pid, guard pid, supervisor pid, port, root,
   start time) with write-to-temp plus rename, and removes it only if it still names itself.
3. **Reaper for the case where the guard died too** (both SIGKILLed): at startup, for each pid file whose supervisor is dead, signal the
   kernel only if its live command line is exactly `vanta-kernel serve <port>` for the recorded port. Pid reuse or a hand-edited file can
   never kill an unrelated process; a live supervisor's kernel is never touched.
4. **Graceful paths still do real work**: tree-kill from the shell on quit (record descendants before signalling, SIGKILL stragglers,
   await exit) so normal quits are immediate and the watcher is only the backstop.

## Second lesson: cross-process, not just in-process

A single-flight map fixed two callers in one process, but two runtimes on one profile and port raced: both spawned, the loser's
kernel failed to bind, and the loser's guard replaced then deleted the winner's pid file. The lock that fixes it is an `O_EXCL` file
`run/kernel-<port>.lock` (pid, token, start time) held only during the start window, replaced when its holder is dead or the lock is
older than the readiness window by a wide margin, released only by token. Losers wait for the winner's kernel and attach.

## How to apply

- Any time a process starts a long-lived child that must not outlive it: put a watcher in the middle; do not trust `exit` hooks.
- Test the lifecycle with real signals and a process-table count (`ps`), counting only pids you started, per exit path, and also with a
  second instance. A unit test of a handler passes while the real SIGKILL path leaks.
- Tools: `vanta-ts/scripts/kernel-lifecycle-repro.mjs` (`--two-runtimes`), `desktop-next/tools/prove-kernel-lifecycle.mjs`,
  `vanta-ts/scripts/desktop-kernel-lifecycle-proof.mjs`. Numbers: `desktop-next/docs/proofs/kernel-lifecycle/`.
