import { decomposeGoal, runKanbanSwarm } from "../kanban/kanban.js";
import { formatKanbanBoard, formatKanbanDigest } from "../kanban/format.js";
import { latestKanbanId, loadKanbanBoard, saveKanbanBoard } from "../kanban/store.js";

function usage(log: (line: string) => void): number {
  log("Usage: vanta kanban create <goal>");
  log("       vanta kanban status [board-id]");
  log("       vanta kanban swarm [board-id]");
  log("       vanta kanban digest [board-id]");
  return 1;
}

function resolveBoardId(repoRoot: string, id: string | undefined): string {
  const resolved = id ?? latestKanbanId(repoRoot);
  if (!resolved) throw new Error("no kanban boards found");
  return resolved;
}

export async function runKanbanCommand(repoRoot: string, rest: string[], log: (line: string) => void = console.log): Promise<number> {
  const [cmd = "status", ...args] = rest;
  if (cmd === "create") {
    const goal = args.join(" ").trim();
    if (!goal) return usage(log);
    const board = decomposeGoal(goal);
    saveKanbanBoard(repoRoot, board);
    log(formatKanbanBoard(board));
    return 0;
  }
  if (cmd === "status") {
    log(formatKanbanBoard(loadKanbanBoard(repoRoot, resolveBoardId(repoRoot, args[0]))));
    return 0;
  }
  if (cmd === "digest") {
    log(formatKanbanDigest(loadKanbanBoard(repoRoot, resolveBoardId(repoRoot, args[0]))));
    return 0;
  }
  if (cmd === "swarm") {
    const board = loadKanbanBoard(repoRoot, resolveBoardId(repoRoot, args[0]));
    const next = await runKanbanSwarm(board);
    saveKanbanBoard(repoRoot, next);
    log(formatKanbanDigest(next));
    return 0;
  }
  return usage(log);
}
