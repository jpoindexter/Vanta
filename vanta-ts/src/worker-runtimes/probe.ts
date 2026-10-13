import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";
import { buildSafeChildEnv } from "../exec/child-env.js";
import { PROBE_TIMEOUT_MS } from "./constants.js";
import type { DetectResult } from "./types.js";

// Detection runs fixed, argument-free-of-user-input commands (`<cli> --version`,
// and the CLI's own auth status command). Only the exit code of a status
// command is used: its output (which can name an account) is dropped, and no
// credential file is ever opened by Vanta.

export type ProbeResult = { code: number | null; stdout: string; missing: boolean };
export type ProbeFn = (command: string, args: string[], env: NodeJS.ProcessEnv) => Promise<ProbeResult>;

export const runProbe: ProbeFn = (command, args, env) =>
  new Promise((resolve) => {
    execFile(command, args, { env: buildSafeChildEnv(env), timeout: PROBE_TIMEOUT_MS, maxBuffer: 64 * 1024, shell: false }, (error, stdout) => {
      const raw: unknown = error ? (error as { code?: unknown }).code : 0;
      resolve({ code: typeof raw === "number" ? raw : null, stdout: String(stdout ?? ""), missing: raw === "ENOENT" });
    });
  });

export function isOnPath(command: string, env: NodeJS.ProcessEnv): boolean {
  if (command.includes("/")) return existsSync(command);
  return (env.PATH ?? "").split(delimiter).some((dir) => dir !== "" && existsSync(join(dir, command)));
}

/** "2.1.222 (Claude Code)" -> "2.1.222"; "codex-cli 0.144.1" -> "0.144.1"; "Hermes Agent v0.21.7+495.g6e7b83a (...)" -> "0.21.7+495.g6e7b83a". */
export function parseVersion(output: string): string | null {
  const match = /v?(\d+\.\d+\.\d+[\w.+-]*)/.exec(output.split("\n")[0] ?? "");
  return match?.[1] ?? null;
}

export type DetectSpec = {
  runtimeId: string;
  command: string;
  selfApproving: boolean;
  /** The CLI's own login status command; exit 0 means signed in. Absent: auth is unknown. */
  authArgs?: string[];
  /** Run `<cmd> --version`. False for user-declared CLIs, which are never executed to probe them. */
  runVersion: boolean;
};

export async function detectCli(spec: DetectSpec, env: NodeJS.ProcessEnv, probe: ProbeFn = runProbe): Promise<DetectResult> {
  const base = { runtimeId: spec.runtimeId, command: spec.command, selfApproving: spec.selfApproving };
  if (!isOnPath(spec.command, env)) return { ...base, installed: false, command: null, version: null, auth: "unknown", reason: `${spec.command} is not on PATH` };
  if (!spec.runVersion) return { ...base, installed: true, version: null, auth: "unknown" };
  const version = await probe(spec.command, ["--version"], env);
  if (version.missing || version.code !== 0) return { ...base, installed: false, command: null, version: null, auth: "unknown", reason: `${spec.command} --version did not run` };
  const auth = spec.authArgs ? await probe(spec.command, spec.authArgs, env) : null;
  return { ...base, installed: true, version: parseVersion(version.stdout), auth: auth === null ? "unknown" : auth.code === 0 ? "authenticated" : "unauthenticated" };
}
