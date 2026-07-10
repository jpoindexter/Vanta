import { createInterface } from "node:readline/promises";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { RoadmapSchema, type RoadmapItem } from "../roadmap/schema.js";
import { formatNowEmptyState, formatNowQueue, selectNowCandidates } from "../roadmap/now-queue.js";
import { moveRoadmapItem } from "../roadmap/move.js";

export type NowCommandDeps = {
  log?: (line: string) => void;
  confirm?: (items: RoadmapItem[]) => Promise<boolean>;
};

async function defaultConfirm(items: RoadmapItem[]): Promise<boolean> {
  if (!process.stdin.isTTY) return false;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`Move ${items.length} card${items.length === 1 ? "" : "s"} to Now? [y/N] `);
    return answer.trim().toLowerCase() === "y";
  } finally {
    rl.close();
  }
}

export async function runNowCommand(
  repoRoot: string,
  args: string[] = [],
  deps: NowCommandDeps = {},
): Promise<number> {
  const log = deps.log ?? console.log;
  const apply = args.includes("--apply") || args.includes("--yes");
  const raw = await readFile(join(repoRoot, "roadmap.json"), "utf8");
  const roadmap = RoadmapSchema.parse(JSON.parse(raw));
  const candidates = selectNowCandidates(roadmap.items);
  if (candidates.length === 0) {
    log(formatNowEmptyState(roadmap.items));
    return 0;
  }
  log(formatNowQueue(candidates));

  const accepted = apply || await (deps.confirm ?? defaultConfirm)(candidates);
  if (!accepted) {
    log("Run `vanta now --apply` to move the proposed card(s).");
    return 0;
  }

  for (const item of candidates) {
    const moved = await moveRoadmapItem(repoRoot, item.id, "building");
    log(`moved ${moved.id} -> building`);
  }
  return 0;
}
