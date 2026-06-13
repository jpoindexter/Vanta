import { z } from "zod";
import type { Tool, ToolResult } from "./types.js";
import { appendTeam, readTeam, latestWorkers, type Worker } from "../team/store.js";

const Args = z.object({
  action: z.enum(["define", "status", "list"]),
  id: z.string().optional(),
  role: z.string().optional(),
  model: z.string().optional(),
  tools: z.array(z.string()).optional(),
  note: z.string().optional(),
  status: z.enum(["idle", "running", "blocked", "done"]).optional(),
});
type Parsed = z.infer<typeof Args>;

async function doDefine(a: Parsed): Promise<ToolResult> {
  if (!a.id || !a.role) return { ok: false, output: "define needs id, role" };
  const existing = latestWorkers(await readTeam()).find((w) => w.id === a.id);
  const rec: Worker = {
    kind: "worker",
    id: a.id,
    role: a.role,
    model: a.model ?? existing?.model,
    tools: a.tools ?? existing?.tools,
    status: existing?.status ?? "idle",
    note: a.note ?? existing?.note,
    ts: new Date().toISOString(),
  };
  await appendTeam(rec);
  return { ok: true, output: `defined worker ${a.id} (${a.role})` };
}

async function doStatus(a: Parsed): Promise<ToolResult> {
  if (!a.id || !a.status) return { ok: false, output: "status needs id, status" };
  const workers = latestWorkers(await readTeam());
  const existing = workers.find((w) => w.id === a.id);
  if (!existing) return { ok: false, output: `unknown worker id "${a.id}" — define it first` };
  await appendTeam({ ...existing, status: a.status, ts: new Date().toISOString() });
  return { ok: true, output: `${a.id} → ${a.status}` };
}

function formatRoster(workers: Worker[]): string {
  if (!workers.length) return "team roster is empty — define workers first (action:define)";
  return workers.map((w) => `${w.id} · ${w.role} · ${w.status}${w.note ? ` — ${w.note}` : ""}`).join("\n");
}

async function doList(): Promise<ToolResult> {
  const workers = latestWorkers(await readTeam());
  return { ok: true, output: formatRoster(workers) };
}

export const teamTool: Tool = {
  schema: {
    name: "team",
    description:
      "A durable roster of named workers (role/model/tools/status) — definitions only; " +
      "the runtime executor is a later slice. " +
      "action:define adds/updates a worker (id, role, model?, tools?, note?); " +
      "action:status updates a worker's status (id, status: idle|running|blocked|done); " +
      "action:list returns the full roster with statuses.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["define", "status", "list"], description: "define a worker | update status | list roster" },
        id: { type: "string", description: "stable worker id slug" },
        role: { type: "string", description: "worker role description (for define)" },
        model: { type: "string", description: "model id the worker runs on (optional)" },
        tools: { type: "array", items: { type: "string" }, description: "tool names available to the worker (optional)" },
        note: { type: "string", description: "optional detail or current task note" },
        status: { type: "string", enum: ["idle", "running", "blocked", "done"], description: "new status (for status action)" },
      },
      required: ["action"],
    },
  },
  describeForSafety: (a) => `team ${String(a.action ?? "")}`,
  async execute(raw) {
    const p = Args.safeParse(raw);
    if (!p.success) return { ok: false, output: "team needs action: define | status | list" };
    if (p.data.action === "define") return doDefine(p.data);
    if (p.data.action === "status") return doStatus(p.data);
    return doList();
  },
};
