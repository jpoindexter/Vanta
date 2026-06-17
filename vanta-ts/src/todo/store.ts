import { z } from "zod";
import { resolveMemoryStore } from "../store/memory-store.js";

// A simple in-session plan (todo list) the agent maintains for multi-step work,
// stored at ~/.vanta/todo.json and viewable with /plan. TodoWrite-style: the
// agent rewrites the whole list each update.

export const TodoItemSchema = z.object({
  text: z.string().min(1),
  status: z.enum(["pending", "in_progress", "done"]),
});
export type TodoItem = z.infer<typeof TodoItemSchema>;
const TodoFileSchema = z.array(TodoItemSchema);

export async function readTodos(env: NodeJS.ProcessEnv = process.env): Promise<TodoItem[]> {
  const store = resolveMemoryStore(env);
  try {
    const raw = await store.read("todo.json");
    if (raw === null) return [];
    return TodoFileSchema.parse(JSON.parse(raw));
  } catch {
    return [];
  }
}

export async function writeTodos(items: TodoItem[], env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const store = resolveMemoryStore(env);
  await store.write("todo.json", JSON.stringify(items, null, 2));
}

/** Render the plan for /plan and the `todo` list action. */
export function formatTodos(items: TodoItem[]): string {
  if (!items.length) return "  (no plan yet)";
  const mark = (s: TodoItem["status"]) => (s === "done" ? "✓" : s === "in_progress" ? "▸" : "○");
  const done = items.filter((i) => i.status === "done").length;
  return `${items.map((i) => `  ${mark(i.status)} ${i.text}`).join("\n")}\n  (${done}/${items.length} done)`;
}
