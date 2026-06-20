import { z } from "zod";
import type { PluginManifest } from "./manifest.js";

/**
 * A plugin-declared background monitor. Auto-arms when the plugin is enabled
 * for a session. `command` runs on a fixed `intervalMs`; `event`-only monitors
 * arm passively (their handle releases on disarm but they need no scheduler).
 */
export const MonitorSchema = z
  .object({
    name: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
    command: z.string().min(1).optional(),
    event: z.string().min(1).optional(),
    intervalMs: z.number().int().positive().optional(),
  })
  .strict()
  .refine((m) => Boolean(m.command) || Boolean(m.event), {
    message: "monitor must declare a command or an event",
  });

export type Monitor = z.infer<typeof MonitorSchema>;

/** A live disarm handle: calling `disarm()` releases the monitor's resources. */
export type DisarmHandle = { name: string; disarm: () => void };

/**
 * Injected side effects so arm/disarm is pure and unit-testable.
 * - `schedule(intervalMs, fire)` arms a recurring monitor, returning its disarm fn.
 * - `run(monitor)` performs the monitor's work; errors are swallowed so one
 *   misbehaving monitor never breaks plugin load (errors-as-values).
 */
export type MonitorDeps = {
  schedule: (intervalMs: number, fire: () => void) => () => void;
  run: (monitor: Monitor) => void | Promise<void>;
};

function fire(monitor: Monitor, run: MonitorDeps["run"]): void {
  try {
    void Promise.resolve(run(monitor)).catch(() => {});
  } catch {
    // A monitor failure is a value, never a thrown break.
  }
}

function armOne(monitor: Monitor, deps: MonitorDeps): DisarmHandle {
  if (typeof monitor.intervalMs === "number") {
    const disarm = deps.schedule(monitor.intervalMs, () => fire(monitor, deps.run));
    return { name: monitor.name, disarm };
  }
  // Event-only monitor: armed passively, no scheduler engaged.
  return { name: monitor.name, disarm: () => {} };
}

/**
 * Arm every monitor a plugin declares. A plugin with no `monitors` is a pure
 * no-op: an empty handle list and no `schedule` call. One monitor that throws
 * while arming is skipped, never aborting the rest (errors-as-values).
 */
export function armMonitors(plugin: PluginManifest, deps: MonitorDeps): DisarmHandle[] {
  const declared = plugin.monitors ?? [];
  const handles: DisarmHandle[] = [];
  for (const monitor of declared) {
    try {
      handles.push(armOne(monitor, deps));
    } catch {
      // Skip a monitor that fails to arm; the rest still load.
    }
  }
  return handles;
}

/** Release every armed monitor. Idempotent: a failing disarm never blocks the rest. */
export function disarmMonitors(handles: DisarmHandle[]): void {
  for (const handle of handles) {
    try {
      handle.disarm();
    } catch {
      // A failed release is best-effort; keep releasing the rest.
    }
  }
}
