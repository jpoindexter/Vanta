import { z } from "zod";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Tool, ToolContext, ToolResult } from "./types.js";
import {
  saveDef,
  loadDef,
  listDefs,
  saveState,
  loadState,
  removeLoop,
} from "../loop/store.js";
import { newState } from "../loop/types.js";
import { dataDirFor } from "../cli/ops.js";
import {
  parseTrigger,
  triggerSummary,
  slugifyGoal,
  uniqueId,
  buildLoopDef,
  assertValidId,
} from "../cli/loop-cmd-build.js";

// `loop` tool — create and manage first-class loops from the agent's own loop.
// The agent calls `run` to fire a single iteration in a background process
// (no re-entrant agent turns) and all other actions inline.

const Args = z.object({
  action: z.enum(["add", "list", "run", "pause", "resume", "kill", "show"]),
  id: z.string().optional(),
  goal: z.string().optional(),
  trigger: z.string().optional(),
  purge: z.boolean().optional(),
});
type ParsedArgs = z.infer<typeof Args>;

/** Resolve the CLI entry point for spawning background `vanta loop run`. */
function resolveCliPath(): string {
  // __filename → vanta-ts/src/tools/loop.ts; two dirs up = vanta-ts/src/cli.ts
  const here = fileURLToPath(import.meta.url);
  return join(here, "..", "..", "cli.ts");
}

async function execAdd(a: ParsedArgs, dataDir: string): Promise<ToolResult> {
  if (!a.goal?.trim()) return { ok: false, output: "add requires goal" };
  let trigger;
  try { trigger = parseTrigger(a.trigger ?? "heartbeat"); }
  catch (e: unknown) { return { ok: false, output: e instanceof Error ? e.message : String(e) }; }

  const baseId = a.id ?? slugifyGoal(a.goal);
  let id: string;
  try {
    id = await uniqueId(baseId, dataDir);
    assertValidId(id);
  } catch (e: unknown) {
    return { ok: false, output: e instanceof Error ? e.message : String(e) };
  }

  const def = buildLoopDef(id, a.goal, trigger);
  await saveDef(dataDir, def);
  await saveState(dataDir, newState(id));
  return { ok: true, output: `registered loop ${id} (${triggerSummary(trigger)})` };
}

async function execList(dataDir: string): Promise<ToolResult> {
  const defs = await listDefs(dataDir);
  if (!defs.length) return { ok: true, output: "no loops registered" };
  const lines = await Promise.all(
    defs.map(async (d) => {
      const s = await loadState(dataDir, d.id);
      const last = s.lastScore != null ? String(s.lastScore) : "-";
      return `${d.id}  ${d.status}  ${triggerSummary(d.trigger)}  iter=${s.iterations}  last=${last}`;
    }),
  );
  return { ok: true, output: lines.join("\n") };
}

async function execStatusChange(
  id: string | undefined,
  dataDir: string,
  status: "paused" | "active" | "killed",
): Promise<ToolResult> {
  if (!id) return { ok: false, output: `${status} requires id` };
  const def = await loadDef(dataDir, id);
  if (!def) return { ok: false, output: `unknown loop: ${id}` };
  await saveDef(dataDir, { ...def, status });
  return { ok: true, output: `loop ${id} → ${status}` };
}

async function execKill(a: ParsedArgs, dataDir: string): Promise<ToolResult> {
  if (!a.id) return { ok: false, output: "kill requires id" };
  const def = await loadDef(dataDir, a.id);
  if (!def) return { ok: false, output: `unknown loop: ${a.id}` };
  if (a.purge) {
    await removeLoop(dataDir, a.id);
    return { ok: true, output: `removed loop ${a.id}` };
  }
  await saveDef(dataDir, { ...def, status: "killed" });
  return { ok: true, output: `killed loop ${a.id}` };
}

async function execShow(id: string | undefined, dataDir: string): Promise<ToolResult> {
  if (!id) return { ok: false, output: "show requires id" };
  const def = await loadDef(dataDir, id);
  if (!def) return { ok: false, output: `unknown loop: ${id}` };
  const state = await loadState(dataDir, id);
  const history = state.history.slice(-5).map((h) =>
    `  ${h.at}  score=${h.score ?? "-"}  ${h.note}`,
  );
  const historyText = history.length ? `\nLast iterations:\n${history.join("\n")}` : "";
  return { ok: true, output: `${JSON.stringify(def, null, 2)}${historyText}` };
}

/** Spawn `vanta loop run <id>` detached so the tool returns immediately. */
async function execRun(id: string | undefined, dataDir: string, ctx: ToolContext): Promise<ToolResult> {
  if (!id) return { ok: false, output: "run requires id" };
  const def = await loadDef(dataDir, id);
  if (!def) return { ok: false, output: `unknown loop: ${id}` };

  const cliPath = resolveCliPath();
  const child = spawn(
    process.execPath,
    ["--import", "tsx/esm", cliPath, "loop", "run", id],
    { detached: true, stdio: "ignore", cwd: ctx.root },
  );
  child.unref();
  return { ok: true, output: `started loop ${id} (running in background)` };
}

export const loopTool: Tool = {
  schema: {
    name: "loop",
    description:
      "Create and manage first-class loops: durable, goal-driven iteration cycles that run " +
      "stages (discover/plan/execute/evaluate/improve) on a trigger (heartbeat/cron/manual). " +
      "Use add to register, list/show to inspect, pause/resume/kill to control status, " +
      "and run to fire one iteration as a background process (non-blocking).",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["add", "list", "run", "pause", "resume", "kill", "show"],
          description: "What to do.",
        },
        id: { type: "string", description: "Loop id (required except for add/list)." },
        goal: { type: "string", description: "add: natural-language goal the loop pursues." },
        trigger: {
          type: "string",
          description: "add: trigger spec — manual | heartbeat | heartbeat:<N> | cron:\"<expr>\".",
        },
        purge: { type: "boolean", description: "kill: if true, delete files instead of marking killed." },
      },
      required: ["action"],
    },
  },
  describeForSafety: (a) => `loop ${String(a.action ?? "")} ${String(a.id ?? "")}`.trim(),
  async execute(raw, ctx) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, output: "loop needs action: add | list | run | pause | resume | kill | show" };
    }
    const a = parsed.data;
    const dataDir = dataDirFor(ctx.root);

    if (a.action === "add") return execAdd(a, dataDir);
    if (a.action === "list") return execList(dataDir);
    if (a.action === "run") return execRun(a.id, dataDir, ctx);
    if (a.action === "pause") return execStatusChange(a.id, dataDir, "paused");
    if (a.action === "resume") return execStatusChange(a.id, dataDir, "active");
    if (a.action === "kill") return execKill(a, dataDir);
    if (a.action === "show") return execShow(a.id, dataDir);
    return { ok: false, output: `unknown action: ${String(a.action)}` };
  },
};
