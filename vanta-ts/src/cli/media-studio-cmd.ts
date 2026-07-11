import { readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { resolveInScope } from "../scope.js";
import { MediaBriefSchema, mediaProductionBoard, previewMediaBrief, productionStages, renderMediaBrief } from "../media-studio/studio.js";
import { saveKanbanBoard } from "../kanban/store.js";
import { z } from "zod";

const USAGE = "usage: vanta media-studio preview|render|board <brief.json> [--yes] | stages";
const ActionSchema = z.enum(["preview", "render", "board"]);

export async function runMediaStudioCommand(root: string, args: string[], log: (line: string) => void = console.log): Promise<number> {
  const [action, path] = args;
  if (action === "stages") { for (const stage of productionStages()) log(`${stage.id}\t${stage.role}\t${stage.evidence}`); return 0; }
  const parsedAction = ActionSchema.safeParse(action);
  if (!path || !parsedAction.success) { log(USAGE); return 1; }
  try {
    const scoped = resolveInScope(path, root);
    if (!scoped.ok) throw new Error(`brief outside project: ${path}`);
    const parsed = MediaBriefSchema.parse(JSON.parse(await readFile(scoped.path, "utf8")));
    if (parsedAction.data === "board") { const board = mediaProductionBoard(parsed); saveKanbanBoard(root, board); log(`media board ${board.id}\nroute: vanta kanban route <lane> --board ${board.id}`); return 0; }
    const preview = previewMediaBrief(parsed);
    log(JSON.stringify(preview, null, 2));
    if (parsedAction.data === "preview") return 0;
    if (!args.includes("--yes")) { log("not rendered; review preview and rerun with --yes"); return 1; }
    const result = await renderMediaBrief(root, parsed, { receiptDir: join(root, ".vanta", "media", "receipts") });
    log(`verified ${relative(root, result.output)}\nreceipt ${relative(root, result.receiptPath)}`);
    return 0;
  } catch (error) { log(`media-studio error: ${(error as Error).message}`); return 1; }
}
