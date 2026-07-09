import { dirname, resolve } from "node:path";

type AccessKind = "readable" | "writable";

function q(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function relaunchLine(root: string, env: string, dir: string): string {
  return `cd ${q(root)} && ${env}=${q(dir)} vanta`;
}

function projectRootLine(dir: string): string {
  return `cd ${q(dir)} && vanta`;
}

function accessEnv(kind: AccessKind): string {
  return kind === "readable" ? "VANTA_READABLE_DIRS" : "VANTA_WRITABLE_DIRS";
}

function accessVerb(kind: AccessKind): string {
  return kind === "readable" ? "read" : "write";
}

export function pathScopeRecovery(args: {
  kind: AccessKind;
  abs: string;
  root: string;
}): string {
  const dir = dirname(resolve(args.abs));
  const env = accessEnv(args.kind);
  return [
    "Recovery:",
    `- One-shot this session: /add-dir ${dir}`,
    `- Persistent ${accessVerb(args.kind)} scope: ${relaunchLine(args.root, env, dir)}`,
    `- If that path is the actual project, relaunch from it: ${projectRootLine(dir)}`,
  ].join("\n");
}

export function sandboxBackgroundRecovery(root: string): string {
  return [
    "Recovery:",
    "- For a short command, retry in the foreground without background:true.",
    `- For a long-running command or dev server, relaunch non-sandboxed: cd ${q(root)} && VANTA_SHELL_SANDBOX=0 vanta`,
    "- Then retry the command with background:true.",
  ].join("\n");
}

export function sandboxServeRecovery(root: string): string {
  return [
    "Recovery:",
    `- Relaunch non-sandboxed for server work: cd ${q(root)} && VANTA_SHELL_SANDBOX=0 vanta`,
    "- Then start the server with background:true.",
    "- If you only need static output, build files instead of serving.",
  ].join("\n");
}

