import { openSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import { isAbsolute, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { readGatewayReadiness, type GatewayReadinessSnapshot } from "../gateway/readiness-state.js";

export type DesktopGatewayStartResult = {
  state: "live" | "starting" | "failed";
  message: string;
};

type GatewayControlDeps = {
  now?: () => number;
  read?: (dataDir: string) => Promise<GatewayReadinessSnapshot | null>;
  launch?: (root: string, logPath: string) => ChildProcess;
  wait?: (ms: number) => Promise<unknown>;
};

const FRESH_MS = 180_000;
const requireFromHere = createRequire(import.meta.url);

function live(snapshot: GatewayReadinessSnapshot | null, now: number): boolean {
  return Boolean(snapshot && now - Date.parse(snapshot.updatedAt) <= FRESH_MS && snapshot.channels.some((channel) => channel.status === "up"));
}

function resolvedModuleSpecifier(value: string): string {
  if (/^(?:file:|node:|data:)/.test(value) || isAbsolute(value) || value.startsWith(".")) return value;
  try { return pathToFileURL(requireFromHere.resolve(value)).href; }
  catch { return value; }
}

export function gatewayNodeArgs(execArgv: string[], entry: string): string[] {
  const args = [...execArgv];
  for (let index = 0; index < args.length; index += 1) {
    if ((args[index] === "--import" || args[index] === "--loader") && args[index + 1]) {
      args[index + 1] = resolvedModuleSpecifier(args[index + 1]!);
      index += 1;
      continue;
    }
    const match = /^(--import|--loader)=(.+)$/.exec(args[index] ?? "");
    if (match) args[index] = `${match[1]}=${resolvedModuleSpecifier(match[2]!)}`;
  }
  return [...args, entry, "gateway"];
}

function launchGateway(root: string, logPath: string): ChildProcess {
  const entry = process.argv[1];
  if (!entry) throw new Error("Vanta CLI entry point is unavailable.");
  const log = openSync(logPath, "a", 0o600);
  const child = spawn(process.execPath, gatewayNodeArgs(process.execArgv, entry), {
    cwd: root,
    detached: true,
    env: process.env,
    stdio: ["ignore", log, log],
  });
  child.unref();
  return child;
}

export async function startDesktopGateway(root: string, deps: GatewayControlDeps = {}): Promise<DesktopGatewayStartResult> {
  const now = deps.now ?? Date.now;
  const read = deps.read ?? readGatewayReadiness;
  const dataDir = join(root, ".vanta");
  const existing = await read(dataDir);
  if (live(existing, now())) return { state: "live", message: "Gateway is already live." };

  await mkdir(dataDir, { recursive: true });
  const logPath = join(dataDir, "gateway-desktop.log");
  const child = (deps.launch ?? launchGateway)(root, logPath);
  const launchedAt = now();
  const wait = deps.wait ?? delay;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await wait(250);
    if (child.exitCode !== null) {
      return { state: "failed", message: `Gateway exited before becoming ready. Inspect ${logPath}.` };
    }
    const snapshot = await read(dataDir);
    if (snapshot && Date.parse(snapshot.updatedAt) >= launchedAt && live(snapshot, now())) {
      return { state: "live", message: `Gateway is live with ${snapshot.channels.filter((channel) => channel.status === "up").length} channel${snapshot.channels.filter((channel) => channel.status === "up").length === 1 ? "" : "s"}.` };
    }
  }
  return { state: "starting", message: `Gateway is starting. Progress is recorded in ${logPath}.` };
}
