import type { Trigger, Stage } from "../loop/types.js";
import { TriggerSchema, LoopDefSchema } from "../loop/types.js";
import { listDefs, isValidLoopId } from "../loop/store.js";
import type { LoopDef } from "../loop/types.js";

// Builders shared between the CLI command and the agent tool.
// Isolated here to keep loop-cmd.ts and tools/loop.ts under the line cap.

/** Parse a CLI trigger spec into a Trigger discriminated union.
 *  Valid forms: `manual`, `heartbeat`, `heartbeat:<N>`, `cron:"<expr>"`. */
export function parseTrigger(spec: string): Trigger {
  if (!spec || spec === "manual") return { kind: "manual" };
  if (spec === "heartbeat") return TriggerSchema.parse({ kind: "heartbeat", everyTicks: 1 });
  const hbMatch = spec.match(/^heartbeat:(\d+)$/);
  if (hbMatch) return TriggerSchema.parse({ kind: "heartbeat", everyTicks: Number(hbMatch[1]) });
  const cronMatch = spec.match(/^cron:"(.+)"$/) ?? spec.match(/^cron:(.+)$/);
  if (cronMatch) return TriggerSchema.parse({ kind: "cron", expr: cronMatch[1]!.trim() });
  throw new Error(`unknown trigger spec "${spec}". Use: manual | heartbeat | heartbeat:<N> | cron:"<expr>"`);
}

/** Human-readable summary of a trigger for CLI output. */
export function triggerSummary(t: Trigger): string {
  switch (t.kind) {
    case "manual": return "manual";
    case "heartbeat": return `heartbeat every ${t.everyTicks} tick(s)`;
    case "cron": return `cron ${t.expr}`;
    case "event": return `event:${t.event}`;
  }
}

/** Derive a URL-safe slug from a goal string (≤48 chars). */
export function slugifyGoal(goal: string): string {
  return goal
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/, "");
}

/** Return a unique id derived from `base`, appending `-2`, `-3`… if taken. */
export async function uniqueId(base: string, dataDir: string): Promise<string> {
  const existing = await listDefs(dataDir);
  const taken = new Set(existing.map((d) => d.id));
  if (!taken.has(base)) return base;
  for (let n = 2; n < 1000; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  throw new Error("could not find a unique loop id (over 1000 variants?)");
}

/** Build the conventional 5-stage loop body for a given goal. */
export function defaultStages(goal: string): Stage[] {
  return [
    {
      name: "discover",
      prompt: `Survey the current state relevant to the goal. Identify what has been done, what is missing, and what the next concrete gap is. Goal: ${goal}`,
      critiqueDriven: false,
    },
    {
      name: "plan",
      prompt: `Given the discovery, write a specific, minimal plan for the next concrete unit of work. Prefer the smallest change that makes measurable progress. Goal: ${goal}`,
      critiqueDriven: false,
    },
    {
      name: "execute",
      prompt: "Do the next concrete unit of work toward the goal.",
      critiqueDriven: false,
    },
    {
      name: "evaluate",
      prompt:
        "Score the work against the goal from 0 to 1. Consider: was the plan followed, was quality acceptable, did it move the goal forward? End your reply with a line: SCORE: <0..1>.",
      critiqueDriven: false,
    },
    {
      name: "improve",
      prompt: `Capture lessons from this iteration. What worked, what did not, and what should change in the next cycle? Goal: ${goal}`,
      critiqueDriven: true,
    },
  ];
}

/** Validate that an id is legal and throw a readable error if not. */
export function assertValidId(id: string): void {
  if (!isValidLoopId(id)) {
    throw new Error(
      `invalid loop id "${id}". Must match [a-z0-9][a-z0-9-]{0,63} (lowercase, digits, dash only).`,
    );
  }
}

/** Build a validated LoopDef from parts. */
export function buildLoopDef(
  id: string,
  goal: string,
  trigger: Trigger,
): LoopDef {
  return LoopDefSchema.parse({
    id,
    goal,
    trigger,
    stages: defaultStages(goal),
    rubric: { items: [], passScore: 0.8 },
    stop: { maxIterations: 10, noProgressWakes: 3 },
    status: "active",
    createdAt: new Date().toISOString(),
  });
}
