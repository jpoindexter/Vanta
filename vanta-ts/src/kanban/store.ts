import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { KanbanBoardSchema, type KanbanBoard } from "./schema.js";

function kanbanDir(repoRoot: string): string {
  return join(repoRoot, ".vanta", "kanban");
}

export function kanbanPath(repoRoot: string, id: string): string {
  return join(kanbanDir(repoRoot), `${id}.json`);
}

export function saveKanbanBoard(repoRoot: string, board: KanbanBoard): void {
  mkdirSync(kanbanDir(repoRoot), { recursive: true });
  writeFileSync(kanbanPath(repoRoot, board.id), JSON.stringify(board, null, 2) + "\n", "utf8");
}

export function loadKanbanBoard(repoRoot: string, id: string): KanbanBoard {
  return KanbanBoardSchema.parse(JSON.parse(readFileSync(kanbanPath(repoRoot, id), "utf8")));
}

export function latestKanbanId(repoRoot: string): string | null {
  const dir = kanbanDir(repoRoot);
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((file) => file.endsWith(".json")).sort();
  return files.at(-1)?.replace(/\.json$/, "") ?? null;
}
