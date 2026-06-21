// VANTA-SWARM-TMUX — tmux swarm backend (PURE orchestration slice).
//
// Lays out N fleet workers (see `fleet/fleet.ts` — each FleetWorker is one
// subagent the swarm runs) across tmux panes: a pane-LAYOUT plan (split geometry
// for N panes), a per-pane LOCK (exactly one worker owns a pane at a time), a
// per-worker COLOR (so concurrent panes are visually distinct), and the discrete
// tmux command argv to create/target a pane. Every fn here is PURE/injectable +
// unit-tested.
//
// BOUNDARY — the live tmux spawn is NOT in this module. Running
// `tmux split-window` / `tmux send-keys` (actuating a real pane) is the injected
// boundary; this module only PLANS and builds the argv. See the NAMED wire at
// the bottom for where `fleet/fleet.ts` would, on a tmux backend, call
// planPaneLayout + acquirePane + the argv builders via a spawn.
//
// SECURITY: every builder returns a DISCRETE argv ARRAY, never a shell-
// interpolated string. A `send-keys` command stays ONE argv element — an
// injection-shaped payload like `echo hi; rm -rf /` is a single item, never
// re-split by a shell. tmux is the WHERE (which pane runs a command); the kernel
// `assess()` is still the WHETHER — every command a pane would run is gated by
// the kernel upstream of this module, exactly as for any other tool. This module
// owns geometry/locking/color/argv only; it never decides whether a command may
// run.

import { TEAMMATE_PALETTE, type TeammateColor } from "../ui/teammate-color.js";

/** A pane in the layout plan. `index` is the pane's position (0-based, creation
 * order); `splitDir` is how it is split off from the prior pane — "h" splits the
 * current pane horizontally (a new pane to the right, `tmux split-window -h`),
 * "v" splits vertically (a new pane below, `tmux split-window -v`). */
export type PaneSplit = { index: number; splitDir: "h" | "v" };

/** A balanced pane-layout plan: one entry per pane, in creation order. */
export type PaneLayout = { panes: PaneSplit[] };

/** Options for {@link planPaneLayout}. `firstSplit` picks the orientation of the
 * SECOND pane (the first split); subsequent panes alternate from it, yielding a
 * balanced h/v tiling rather than a single row or column. Defaults to "h". */
export type PlanPaneLayoutOpts = { firstSplit?: "h" | "v" };

/**
 * Plan a balanced split layout for `workerCount` panes. PURE + total.
 *
 * - `workerCount <= 0` → `{ panes: [] }` (no panes).
 * - `workerCount === 1` → one pane at index 0, no split (the first pane is the
 *   tmux window's existing pane; it is never split off, so its `splitDir` is the
 *   default seed orientation and carries no split — there are N-1 real splits for
 *   N panes).
 * - `workerCount >= 2` → N panes; panes[0] is the seed, panes[1..N-1] each carry
 *   a split. Orientation alternates (h,v,h,v,…) starting from `firstSplit` so the
 *   tiling stays balanced instead of degenerating into one long row/column.
 *
 * The first pane is included in the plan (so `panes.length === workerCount`); the
 * number of actual `split-window` calls a caller makes is `panes.length - 1`
 * (every pane after the seed). Non-finite / fractional counts are floored and
 * clamped at 0.
 */
export function planPaneLayout(workerCount: number, opts: PlanPaneLayoutOpts = {}): PaneLayout {
  const count = Number.isFinite(workerCount) ? Math.max(0, Math.floor(workerCount)) : 0;
  if (count === 0) return { panes: [] };
  const seed = opts.firstSplit ?? "h";
  const other: "h" | "v" = seed === "h" ? "v" : "h";
  const panes: PaneSplit[] = [];
  for (let index = 0; index < count; index++) {
    // panes[0] is the seed pane (no real split); panes[1..] alternate from `seed`.
    const splitDir = index === 0 ? seed : (index % 2 === 1 ? seed : other);
    panes.push({ index, splitDir });
  }
  return { panes };
}

/** Per-pane lock state: `locks[paneIndex] === workerId` means that worker owns
 * the pane. Immutable — every transition returns a new state, the input is never
 * mutated. */
export type PaneLockState = { locks: Record<number, string> };

/** Result of {@link acquirePane}: the next state and whether the claim succeeded.
 * On refusal `ok` is false and `state` is returned unchanged. */
export type AcquireResult = { state: PaneLockState; ok: boolean };

/** An empty lock state (no pane held). */
export function emptyPaneLockState(): PaneLockState {
  return { locks: {} };
}

/**
 * Claim a pane for a worker. PURE + immutable (the input state is never mutated).
 *
 * - Pane free → locks it to `workerId`, `ok: true`.
 * - Pane already held by the SAME worker → no-op success (idempotent re-acquire):
 *   `ok: true`, state unchanged. A worker reclaiming its own pane is safe.
 * - Pane held by ANOTHER worker → REFUSED: `ok: false`, state unchanged. One
 *   worker per pane at a time.
 */
export function acquirePane(state: PaneLockState, paneIndex: number, workerId: string): AcquireResult {
  const holder = state.locks[paneIndex];
  if (holder === workerId) return { state, ok: true }; // idempotent self re-acquire
  if (holder !== undefined) return { state, ok: false }; // held by another worker
  return { state: { locks: { ...state.locks, [paneIndex]: workerId } }, ok: true };
}

/**
 * Release a pane's lock. PURE + immutable. Returns a new state with `paneIndex`
 * removed; releasing an already-free pane is a safe no-op (new state, same
 * locks). Does not check the holder — release is owner-agnostic by design (the
 * caller releases panes it created).
 */
export function releasePane(state: PaneLockState, paneIndex: number): PaneLockState {
  if (state.locks[paneIndex] === undefined) return { locks: { ...state.locks } };
  const next: Record<number, string> = {};
  for (const [key, value] of Object.entries(state.locks)) {
    if (Number(key) !== paneIndex) next[Number(key)] = value;
  }
  return { locks: next };
}

/**
 * Deterministic, stable color for a worker by its pane `index`. PURE + total.
 * Cycles {@link TEAMMATE_PALETTE} by index (`index % palette.length`), so pane 0
 * always reads as the first palette color, pane 1 the second, and so on — and the
 * palette repeats once the pane count exceeds it. Keyed by INDEX (not the worker
 * id) so adjacent panes get adjacent, visually-distinct hues; `workerId` is
 * accepted for call-site clarity and a stable association but does not change the
 * result. Negative/fractional indices are normalized into range.
 */
export function assignPaneColor(workerId: string, index: number): TeammateColor {
  void workerId; // index drives the color; id kept for call-site readability
  const len = TEAMMATE_PALETTE.length;
  const safe = Number.isFinite(index) ? Math.floor(index) : 0;
  const slot = ((safe % len) + len) % len; // normalize negatives into [0, len)
  return TEAMMATE_PALETTE[slot] ?? TEAMMATE_PALETTE[0];
}

/**
 * Build the `tmux split-window` argv to create a new pane. PURE. Returns a
 * DISCRETE array — `["split-window", "-h"|"-v", "-P", "-F", "#{pane_id}"]` — for
 * direct `spawn("tmux", argv)` with NO shell. `-h` splits horizontally (pane to
 * the right), `-v` vertically (pane below); `-P -F #{pane_id}` makes tmux print
 * the new pane's id so the caller can target it with {@link buildTmuxSendKeysArgs}.
 * `target` (a pane/window id like `%3` or a session name) scopes the split to an
 * existing pane via `-t` when provided.
 */
export function buildTmuxSplitArgs(target: string, splitDir: "h" | "v"): string[] {
  const argv = ["split-window", splitDir === "v" ? "-v" : "-h"];
  if (target.length > 0) argv.push("-t", target);
  argv.push("-P", "-F", "#{pane_id}");
  return argv;
}

/**
 * Build the `tmux send-keys` argv to run a command in a pane. PURE + INJECTION-
 * SAFE. Returns a DISCRETE array — `["send-keys", "-t", paneTarget, command,
 * "Enter"]`. The `command` is ONE argv element: it is handed to tmux verbatim and
 * NEVER shell-interpolated or re-split, so a payload like `echo hi; rm -rf /`
 * stays a single string tmux types into the pane (tmux does not re-evaluate argv
 * as a shell). The trailing `"Enter"` is tmux's key name that submits the typed
 * line. The command a pane then runs is still gated by the kernel `assess()`
 * upstream — this builder only types it into the WHERE.
 */
export function buildTmuxSendKeysArgs(paneTarget: string, command: string): string[] {
  return ["send-keys", "-t", paneTarget, command, "Enter"];
}

// ── NAMED wire (live tmux spawn is the boundary) ────────────────────────────
//
// On a tmux swarm backend, `fleet/fleet.ts` (where today it creates a worktree +
// spawns a subagent per spec) would, for a run of `specs`:
//
//   const layout = planPaneLayout(specs.length);          // geometry for N panes
//   let locks = emptyPaneLockState();
//   for (const [i, spec] of specs.entries()) {
//     const { state, ok } = acquirePane(locks, i, workerIdFor(spec));
//     if (!ok) continue;                                   // pane already owned → skip
//     locks = state;
//     const color = assignPaneColor(workerIdFor(spec), i); // stable per-pane hue
//     const pane = await spawnTmux(buildTmuxSplitArgs(windowTarget, layout.panes[i].splitDir));
//     await spawnTmux(buildTmuxSendKeysArgs(pane.id, launchCommandFor(spec)));
//     // … and releasePane(locks, i) when the worker finishes.
//   }
//
// `spawnTmux` (the live `tmux` child process) is INJECTED — mirror clarity-gate /
// the perm-routing wire: this module owns only the pure layout + lock + color +
// argv model; actuating a real pane is the boundary. Both the kernel verdict and
// the per-pane lock still gate: locking decides WHICH worker owns a pane, tmux
// the WHERE a command lands, and the kernel the WHETHER it may run at all.
