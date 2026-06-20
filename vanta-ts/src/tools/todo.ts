import { z } from "zod";
import type { Tool } from "./types.js";
import { readTodos, writeTodos, formatTodos, type TodoItem } from "../todo/store.js";
import { normalizeActiveForm } from "./todo-active-form.js";

// The `todo` tool: the agent plans multi-step work as a checklist and marks
// progress. The user sees it with /plan. TodoWrite-style — `write` replaces the
// whole list each call.

const Args = z.object({
  action: z.enum(["write", "list"]),
  items: z
    .array(
      z.object({
        text: z.string().min(1),
        status: z.enum(["pending", "in_progress", "done"]).optional(),
        activeForm: z.string().optional(),
      }),
    )
    .optional(),
});

export const todoTool: Tool = {
  schema: {
    name: "todo",
    description:
      "Track a multi-step plan as a checklist. action=write replaces the list with items " +
      "[{text, status?}] (status: pending|in_progress|done, default pending) — plan before a complex " +
      "task and keep it current as you progress. action=list returns the current plan. The user views it with /plan.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["write", "list"], description: "write replaces the plan; list shows it" },
        items: {
          type: "array",
          description: "The full task list (for write).",
          items: {
            type: "object",
            properties: {
              text: { type: "string", description: "Task description" },
              status: { type: "string", enum: ["pending", "in_progress", "done"], description: "Defaults to pending" },
              activeForm: {
                type: "string",
                description:
                  "Optional present-continuous phrasing (e.g. 'Running the tests'), shown while in_progress",
              },
            },
            required: ["text"],
          },
        },
      },
      required: ["action"],
    },
  },
  describeForSafety: (a) => `todo ${String(a.action ?? "")}`,
  async execute(raw) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) return { ok: false, output: "todo needs action: write | list" };
    if (parsed.data.action === "list") {
      return { ok: true, output: formatTodos(await readTodos()) };
    }
    const items: TodoItem[] = (parsed.data.items ?? []).map((i) => {
      const activeForm = normalizeActiveForm(i.activeForm);
      return { text: i.text, status: i.status ?? "pending", ...(activeForm ? { activeForm } : {}) };
    });
    await writeTodos(items);
    return { ok: true, output: `plan updated (${items.length} task(s))\n${formatTodos(items)}` };
  },
};
