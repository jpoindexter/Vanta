import type { Mount } from "./autonomous-docker.js";

// VANTA-A2A-MOUNT-SCOPE — the policy layer over the autonomous Docker box. Vanta derives the agent's
// blast radius (the mount-set) from the task, so the OS-enforced boundary matches the intent: a build
// gets a writable output dir + read-only inputs; a read task gets read-only access only; a destructive
// task (clean/delete) is flagged for a dry-run preview before anything actually runs. Pure.

export type MountIntent = { kind: "build" | "modify" | "clean" | "read"; destructive: boolean };
export type ScopePlan = { mounts: Mount[]; workdir: string; summary: string; dryRun: boolean };

const DESTRUCTIVE = /\b(delete|deletes|remove|removes|rm|purge|wipe|clean|cleans|tidy|clear|organi[sz]e|organi[sz]es)\b/;
const CLEAN = /\b(clean|cleans|tidy|organi[sz]e|organi[sz]es|delete|remove|purge|wipe)\b/;
const BUILD = /\b(build|create|scaffold|generate|make|implement|set up)\b/;
const MODIFY = /\b(fix|edit|refactor|update|change|modify|patch)\b/;

/** Classify a delegated task into a blast-radius intent: what it writes vs reads, and whether it's
 *  destructive (clean/delete) so it should preview before acting. Keyword heuristic — conservative. */
export function classifyMountIntent(task: string): MountIntent {
  const t = task.toLowerCase();
  const kind: MountIntent["kind"] = CLEAN.test(t) ? "clean" : BUILD.test(t) ? "build" : MODIFY.test(t) ? "modify" : "read";
  return { kind, destructive: DESTRUCTIVE.test(t) };
}

/**
 * Derive the exact mount-set for a task: the output dir at /work (rw for a build/modify/clean, ro for
 * a pure read), plus each read input mounted read-only. A destructive intent sets `dryRun` so the
 * caller previews the plan before running the boxed agent. Nothing outside these mounts is reachable.
 */
export function deriveMountScope(opts: { task: string; outputDir: string; readDirs?: string[]; containerRoot?: string; apply?: boolean }): ScopePlan {
  const root = opts.containerRoot ?? "/work";
  const intent = classifyMountIntent(opts.task);
  // A destructive task previews FIRST: dry-run unless `apply` is set. The dry-run is OS-enforced —
  // the output mounts read-only, so the boxed agent physically cannot write, only describe its plan.
  const dryRun = intent.destructive && !opts.apply;
  const outMode: "ro" | "rw" = intent.kind === "read" || dryRun ? "ro" : "rw";
  const mounts: Mount[] = [{ host: opts.outputDir, container: root, mode: outMode }];
  (opts.readDirs ?? []).forEach((d, i) => mounts.push({ host: d, container: `/ro/${i}`, mode: "ro" }));
  const readPart = opts.readDirs?.length ? `; ro ${opts.readDirs.join(", ")}` : "";
  const summary = `${outMode} ${opts.outputDir} → ${root}${readPart}${dryRun ? " (dry-run: read-only preview — re-run with apply to write)" : ""}`;
  return { mounts, workdir: root, summary, dryRun };
}
