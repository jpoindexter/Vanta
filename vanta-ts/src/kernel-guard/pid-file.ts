import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

/** Shared contract with the guard script: it writes this JSON, the reaper reads it. */
export const KERNEL_PID_FILE_VERSION = 1;
export const KERNEL_GUARD_MARKER = "vanta-kernel-guard";
export const KERNEL_PID_FILE_PATTERN = /^kernel-\d+\.json$/;

export const KernelPidFileSchema = z.object({
  version: z.literal(KERNEL_PID_FILE_VERSION),
  kernelPid: z.number().int().positive(),
  guardPid: z.number().int().positive(),
  supervisorPid: z.number().int().positive(),
  port: z.number().int().min(1).max(65_535),
  root: z.string().min(1),
  kernelBin: z.string().min(1),
  startedAt: z.string().min(1),
});
export type KernelPidFile = z.infer<typeof KernelPidFileSchema>;

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export function kernelRunDir(vantaHome: string): string {
  return join(vantaHome, "run");
}

export function kernelPidFilePath(vantaHome: string, port: number): string {
  return join(kernelRunDir(vantaHome), `kernel-${port}.json`);
}

/** Parse pid file text. The error names the file's problem so a stale file can be diagnosed, not guessed at. */
export function parseKernelPidFile(text: string): Result<KernelPidFile> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "pid file is not valid JSON" };
  }
  const parsed = KernelPidFileSchema.safeParse(raw);
  if (parsed.success) return { ok: true, value: parsed.data };
  const issue = parsed.error.issues[0];
  return { ok: false, error: `pid file field "${issue?.path.join(".") ?? "?"}" is invalid: ${issue?.message ?? "unknown"}` };
}

export function readKernelPidFile(path: string): Result<KernelPidFile> {
  try {
    return parseKernelPidFile(readFileSync(path, "utf8"));
  } catch (error) {
    return { ok: false, error: `cannot read ${path}: ${error instanceof Error ? error.message : String(error)}` };
  }
}

/** Pid files for one profile only: nothing outside `<vantaHome>/run` is ever listed. */
export function listKernelPidFiles(vantaHome: string): string[] {
  try {
    return readdirSync(kernelRunDir(vantaHome))
      .filter((name) => KERNEL_PID_FILE_PATTERN.test(name))
      .map((name) => join(kernelRunDir(vantaHome), name));
  } catch {
    return [];
  }
}

function escapePattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** True only for `<path>/vanta-kernel serve <port>`: a name match alone is never enough to signal a pid. */
export function isKernelCommand(command: string, port: number): boolean {
  const pattern = new RegExp(`(^|[\\\\/])vanta-kernel(\\.exe)?\\s+serve\\s+${port}\\s*$`);
  return pattern.test(command.trim());
}

/** True only for a guard process that was started for this exact pid file. */
export function isGuardCommand(command: string, pidFile: string): boolean {
  return command.includes(KERNEL_GUARD_MARKER) && new RegExp(`\\s${escapePattern(pidFile)}(\\s|$)`).test(command);
}
