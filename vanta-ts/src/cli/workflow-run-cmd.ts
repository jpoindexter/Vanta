import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { formatGraphHandoff, graphReplayPacket, listGraphReplayPackets } from "../workflow/replay.js";
import { requestGraphRunControl, type GraphRunControlAction } from "../workflow/run-control.js";
import { loadGraphRunState } from "../workflow/run-state-store.js";

type Deps = {
  log: (line: string) => void;
  write: typeof writeFile;
  now: () => Date;
};

const defaultDeps: Deps = { log: console.log, write: writeFile, now: () => new Date() };

export async function runWorkflowRunCommand(root: string, args: string[], deps: Deps = defaultDeps): Promise<number> {
  const dataDir = join(root, ".vanta");
  const [command = "list", runId] = args;
  const json = args.includes("--json");
  if (command === "list") return showList(dataDir, json, deps);
  if (!runId) return usage(deps, 1);
  if (command === "inspect") return inspectRun(dataDir, runId, json, deps);
  if (command === "export") return exportRun(dataDir, runId, outputPath(args), deps);
  if (command === "pause" || command === "cancel" || command === "retry") {
    return controlRun(dataDir, runId, command, deps);
  }
  return usage(deps, 1);
}

async function showList(dataDir: string, json: boolean, deps: Deps): Promise<number> {
  const packets = await listGraphReplayPackets(dataDir);
  if (json) deps.log(JSON.stringify(packets, null, 2));
  else if (!packets.length) deps.log("No graph runs found.");
  else packets.forEach((packet) => deps.log(`${packet.runId} · ${packet.graphId} · ${packet.status} · ${packet.updatedAt}`));
  return 0;
}

async function inspectRun(dataDir: string, runId: string, json: boolean, deps: Deps): Promise<number> {
  const packet = await requiredPacket(dataDir, runId, deps);
  if (!packet) return 1;
  deps.log(json ? JSON.stringify(packet, null, 2) : formatGraphHandoff(packet));
  return 0;
}

async function controlRun(dataDir: string, runId: string, action: GraphRunControlAction, deps: Deps): Promise<number> {
  try {
    const run = await requestGraphRunControl(dataDir, runId, action, deps.now().toISOString());
    deps.log(`${action} requested for ${runId} at checkpoint revision ${run.revision - 1}`);
    return 0;
  } catch (error) {
    deps.log(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

async function exportRun(dataDir: string, runId: string, out: string | undefined, deps: Deps): Promise<number> {
  const packet = await requiredPacket(dataDir, runId, deps);
  if (!packet) return 1;
  const path = out ?? `${runId}-handoff.txt`;
  await deps.write(path, formatGraphHandoff(packet), "utf8");
  deps.log(`Wrote ${path}`);
  return 0;
}

async function requiredPacket(dataDir: string, runId: string, deps: Deps) {
  const run = await loadGraphRunState(dataDir, runId);
  if (run) return graphReplayPacket(run);
  deps.log(`graph run not found: ${runId}`);
  return null;
}

function outputPath(args: string[]): string | undefined {
  const index = args.indexOf("--out");
  return index >= 0 ? args[index + 1] : undefined;
}

function usage(deps: Deps, code: number): number {
  deps.log("usage: vanta workflow-run list|inspect|pause|cancel|retry|export <run-id> [--json] [--out <file>]");
  return code;
}
