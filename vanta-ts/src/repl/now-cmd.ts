import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { RoadmapSchema } from "../roadmap/schema.js";
import type { SlashHandler } from "./types.js";

export async function readBuildingItems(dataDir: string) {
  try {
    const src = join(dirname(dataDir), "roadmap.json");
    const data = RoadmapSchema.parse(JSON.parse(await readFile(src, "utf8")));
    return data.items.filter((i) => i.status === "building");
  } catch {
    return [];
  }
}

// /now — operator-gate: Jason puts a card in Now, then types /now to hand it
// to the agent. Agent reads done-criteria from roadmap.json and executes.
export const now: SlashHandler = async (_arg, ctx) => {
  const items = await readBuildingItems(ctx.dataDir);
  if (items.length === 0) {
    return {
      output:
        "  Now column is empty.\n" +
        "  Drag a card to Now in the board ( vanta roadmap serve ) or\n" +
        "  run  /roadmap move <id> building  then /now.",
    };
  }
  const lines = items
    .map((i) => `  - [${i.id}] ${i.title} (${i.size}, ${i.tier ?? "pebble"})`)
    .join("\n");
  const resend =
    `Now column (operator-selected — execute these):\n${lines}\n\n` +
    `Work on the first item. Read its done-criteria and summary from roadmap.json, ` +
    `then execute until the done criteria are met. When done, use roadmap_move to ` +
    `mark it shipped and report what was completed.`;
  return { resend };
};
