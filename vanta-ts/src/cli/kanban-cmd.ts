import { decomposeGoal, runKanbanSwarm } from "../kanban/kanban.js";
import { formatKanbanBoard, formatKanbanDigest } from "../kanban/format.js";
import { latestKanbanId, loadKanbanBoard, saveKanbanBoard } from "../kanban/store.js";
import { readdir } from "node:fs/promises";
import { listProfiles } from "../profiles/store.js";
import { KanbanLaneStatusSchema, KanbanWakePolicySchema, type KanbanBoard } from "../kanban/schema.js";
import {
  addRoutedLane, claimRoutedLane, handoffRoutedLane, retryRoutedLane,
  routeLaneBySkills, updateRoutedLane, type ProfileCapability,
} from "../kanban/router.js";

function usage(log: (line: string) => void): number {
  log("Usage: vanta kanban create <goal>");
  log("       vanta kanban status [board-id]");
  log("       vanta kanban swarm [board-id]");
  log("       vanta kanban digest [board-id]");
  log("       vanta kanban add <id> <title> --instruction <text> [--profile <id> --skills <a,b> --after <id,id> --wake <immediate|scheduled|manual> --fallback <id>]");
  log("       vanta kanban route <lane> | claim <lane> <profile> | handoff <lane> <profile> --reason <text>");
  log("       vanta kanban update <lane> <status> [--detail <text> --evidence <path,path> --fallback <id>] | retry <lane>");
  return 1;
}

function flag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function listFlag(args: string[], name: string): string[] {
  return (flag(args, name) ?? "").split(",").map((value) => value.trim()).filter(Boolean);
}

type Context = { repoRoot: string; args: string[]; log: (line: string) => void; env: NodeJS.ProcessEnv };
type Handler = (context: Context) => Promise<number> | number;

function boardFor(context: Context, positionalId = false): KanbanBoard {
  const requested = flag(context.args, "--board")
    ?? (positionalId ? context.args[0] : undefined);
  return loadKanbanBoard(context.repoRoot, resolveBoardId(context.repoRoot, requested));
}

function saveAndPrint(context: Context, board: KanbanBoard): number {
  saveKanbanBoard(context.repoRoot, board);
  context.log(formatKanbanBoard(board));
  return 0;
}

async function profileCapabilities(env: NodeJS.ProcessEnv): Promise<ProfileCapability[]> {
  const profiles = (await listProfiles(env)).filter((profile) => profile.status !== "archived");
  return Promise.all(profiles.map(async (profile) => {
    try { return { id: profile.id, skills: await readdir(`${profile.home}/skills`) }; }
    catch { return { id: profile.id, skills: [] }; }
  }));
}

const handlers: Record<string, Handler> = {
  create: ({ repoRoot, args, log }) => {
    const goal = args.join(" ").trim();
    if (!goal) return usage(log);
    return saveAndPrint({ repoRoot, args, log, env: process.env }, decomposeGoal(goal));
  },
  status: (context) => { context.log(formatKanbanBoard(boardFor(context, true))); return 0; },
  digest: (context) => { context.log(formatKanbanDigest(boardFor(context, true))); return 0; },
  swarm: async (context) => {
    const next = await runKanbanSwarm(boardFor(context, true));
    saveKanbanBoard(context.repoRoot, next);
    context.log(formatKanbanDigest(next));
    return 0;
  },
  add: (context) => {
    const [id, title] = context.args;
    const instruction = flag(context.args, "--instruction");
    if (!id || !title || !instruction) return usage(context.log);
    const wake = KanbanWakePolicySchema.safeParse(flag(context.args, "--wake") ?? "manual");
    if (!wake.success) throw new Error("wake policy must be immediate, scheduled, or manual");
    return saveAndPrint(context, addRoutedLane(boardFor(context), {
      id, title, instruction, wakePolicy: wake.data,
      requiredSkills: listFlag(context.args, "--skills"), dependencies: listFlag(context.args, "--after"),
      ownerProfile: flag(context.args, "--profile"), fallbackProfile: flag(context.args, "--fallback"),
    }));
  },
  route: async (context) => {
    if (!context.args[0]) return usage(context.log);
    return saveAndPrint(context, routeLaneBySkills(boardFor(context), context.args[0], await profileCapabilities(context.env)));
  },
  claim: async (context) => {
    const [laneId, profileId] = context.args;
    if (!laneId || !profileId) return usage(context.log);
    const profile = (await profileCapabilities(context.env)).find((item) => item.id === profileId);
    if (!profile) throw new Error(`profile not found: ${profileId}`);
    return saveAndPrint(context, claimRoutedLane(boardFor(context), laneId, profile));
  },
  handoff: (context) => {
    const [laneId, to] = context.args;
    const reason = flag(context.args, "--reason");
    if (!laneId || !to || !reason) return usage(context.log);
    return saveAndPrint(context, handoffRoutedLane(boardFor(context), laneId, { to, reason }));
  },
  update: (context) => {
    const [laneId, rawStatus] = context.args;
    const status = KanbanLaneStatusSchema.safeParse(rawStatus);
    if (!laneId || !status.success) return usage(context.log);
    return saveAndPrint(context, updateRoutedLane(boardFor(context), laneId, {
      status: status.data, detail: flag(context.args, "--detail"), evidence: listFlag(context.args, "--evidence"),
      fallbackProfile: flag(context.args, "--fallback"),
    }));
  },
  retry: (context) => context.args[0]
    ? saveAndPrint(context, retryRoutedLane(boardFor(context), context.args[0]))
    : usage(context.log),
};

function resolveBoardId(repoRoot: string, id: string | undefined): string {
  const resolved = id ?? latestKanbanId(repoRoot);
  if (!resolved) throw new Error("no kanban boards found");
  return resolved;
}

export async function runKanbanCommand(repoRoot: string, rest: string[], log: (line: string) => void = console.log, env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const [cmd = "status", ...args] = rest;
  try {
    const handler = handlers[cmd];
    return handler ? await handler({ repoRoot, args, log, env }) : usage(log);
  } catch (error) {
    log(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
