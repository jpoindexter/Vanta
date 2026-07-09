import type { KanbanBoard, KanbanLane } from "./schema.js";

function oneLine(text: string): string {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > 120 ? `${line.slice(0, 117)}...` : line;
}

function laneLine(lane: KanbanLane): string {
  const detail = lane.blocker ? ` blocker: ${oneLine(lane.blocker)}` : lane.result ? ` result: ${oneLine(lane.result)}` : "";
  return `  ${lane.id.padEnd(10)} ${lane.status.padEnd(7)} ${lane.title}${detail}`;
}

export function formatKanbanBoard(board: KanbanBoard): string {
  return [
    `kanban ${board.id}`,
    `goal ${board.goal}`,
    `updated ${board.updated}`,
    "lanes",
    ...board.lanes.map(laneLine),
  ].join("\n");
}

export function formatKanbanDigest(board: KanbanBoard): string {
  const counts = board.lanes.reduce<Record<KanbanLane["status"], number>>((acc, lane) => {
    acc[lane.status]++;
    return acc;
  }, { todo: 0, running: 0, done: 0, blocked: 0 });
  const latestRun = board.swarmRuns.at(-1);
  return [
    `kanban digest ${board.id} · ${counts.done} done · ${counts.blocked} blocked · ${counts.todo} todo · ${counts.running} running`,
    latestRun ? `latest swarm ${latestRun.id} · ${latestRun.lanes.length} lane(s)` : "latest swarm none",
    "progress",
    ...board.lanes.map(laneLine),
  ].join("\n");
}
