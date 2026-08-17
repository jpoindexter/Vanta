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
  return listKanbanBoards(repoRoot)[0]?.id ?? null;
}

export function listKanbanBoards(repoRoot: string): KanbanBoard[] {
  const dir = kanbanDir(repoRoot);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((file) => file.endsWith(".json")).flatMap((file) => {
    try { return [KanbanBoardSchema.parse(JSON.parse(readFileSync(join(dir, file), "utf8")))]; }
    catch { return []; }
  }).sort((a, b) => b.updated.localeCompare(a.updated));
}
