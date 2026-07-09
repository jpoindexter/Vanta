import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { resolveVantaHome } from "../store/home.js";

export const DEEP_PLAN_STATUSES = ["draft", "revision_requested", "approved", "started"] as const;
export type DeepPlanStatus = (typeof DEEP_PLAN_STATUSES)[number];

export const DeepPlanRevisionSchema = z.object({
  rev: z.number().int().positive(),
  at: z.string().min(1),
  note: z.string().min(1),
  content: z.string().min(1),
});
export type DeepPlanRevision = z.infer<typeof DeepPlanRevisionSchema>;

export const DeepPlanSchema = z.object({
  id: z.string().min(1),
  task: z.string().min(1),
  status: z.enum(DEEP_PLAN_STATUSES),
  docPath: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  revisions: z.array(DeepPlanRevisionSchema).min(1),
  reviewNote: z.string().optional(),
});
export type DeepPlan = z.infer<typeof DeepPlanSchema>;

export type DeepPlanResult<T> = { ok: true; value: T } | { ok: false; error: string };

const StoreSchema = z.object({
  version: z.literal(1).default(1),
  plans: z.array(z.unknown()).default([]),
});

export type DeepPlanFs = {
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, data: string) => Promise<void>;
  mkdir: (path: string) => Promise<void>;
};

const realFs: DeepPlanFs = {
  readFile: (p) => readFile(p, "utf8"),
  writeFile: (p, data) => writeFile(p, data, "utf8"),
  mkdir: async (p) => void (await mkdir(p, { recursive: true })),
};

export function deepPlansDir(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.VANTA_PLANS_DIR?.trim();
  return override ? override : join(resolveVantaHome(env), "plans");
}

export function deepPlanStorePath(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolveVantaHome(env), "deep-plans.json");
}

export async function readDeepPlans(
  env: NodeJS.ProcessEnv = process.env,
  fs: DeepPlanFs = realFs,
): Promise<DeepPlan[]> {
  let raw: string;
  try {
    raw = await fs.readFile(deepPlanStorePath(env));
  } catch {
    return [];
  }
  let parsed: z.infer<typeof StoreSchema>;
  try {
    parsed = StoreSchema.parse(JSON.parse(raw));
  } catch {
    return [];
  }
  const plans: DeepPlan[] = [];
  for (const row of parsed.plans) {
    const ok = DeepPlanSchema.safeParse(row);
    if (ok.success) plans.push(ok.data);
  }
  return plans;
}

export async function writeDeepPlans(
  plans: DeepPlan[],
  env: NodeJS.ProcessEnv = process.env,
  fs: DeepPlanFs = realFs,
): Promise<void> {
  await fs.mkdir(resolveVantaHome(env));
  await fs.writeFile(deepPlanStorePath(env), `${JSON.stringify({ version: 1, plans }, null, 2)}\n`);
}

export async function persistDeepPlan(
  plan: DeepPlan,
  env: NodeJS.ProcessEnv = process.env,
  fs: DeepPlanFs = realFs,
): Promise<void> {
  await fs.mkdir(deepPlansDir(env));
  await fs.writeFile(plan.docPath, renderDeepPlanMarkdown(plan));
}

export function createDeepPlan(
  task: string,
  existing: DeepPlan[] = [],
  now: Date = new Date(),
  env: NodeJS.ProcessEnv = process.env,
): DeepPlanResult<DeepPlan> {
  const cleanTask = task.trim();
  if (!cleanTask) return { ok: false, error: "task is required" };
  const id = nextPlanId(cleanTask, existing);
  const at = now.toISOString();
  const plan: DeepPlan = {
    id,
    task: cleanTask,
    status: "draft",
    docPath: join(deepPlansDir(env), `${id}.md`),
    createdAt: at,
    updatedAt: at,
    revisions: [{
      rev: 1,
      at,
      note: "initial plan",
      content: initialPlanContent(cleanTask),
    }],
  };
  return { ok: true, value: plan };
}

export function requestPlanRevision(
  id: string,
  reason: string,
  plans: DeepPlan[],
  now: Date = new Date(),
): DeepPlanResult<DeepPlan[]> {
  const note = reason.trim();
  if (!note) return { ok: false, error: "revision reason is required" };
  return updatePlan(id, plans, now, (plan, at) => ({
    ...plan,
    status: "revision_requested",
    reviewNote: note,
    updatedAt: at,
  }));
}

export function reviseDeepPlan(
  id: string,
  content: string,
  plans: DeepPlan[],
  now: Date = new Date(),
): DeepPlanResult<DeepPlan[]> {
  const clean = content.trim();
  if (!clean) return { ok: false, error: "revision content is required" };
  return updatePlan(id, plans, now, (plan, at) => ({
    ...plan,
    status: "draft",
    reviewNote: undefined,
    updatedAt: at,
    revisions: [
      ...plan.revisions,
      {
        rev: (plan.revisions.at(-1)?.rev ?? 0) + 1,
        at,
        note: "operator revision",
        content: clean,
      },
    ],
  }));
}

export function approveDeepPlan(
  id: string,
  plans: DeepPlan[],
  now: Date = new Date(),
): DeepPlanResult<DeepPlan[]> {
  return updatePlan(id, plans, now, (plan, at) => ({
    ...plan,
    status: "approved",
    reviewNote: "approved for execution",
    updatedAt: at,
  }));
}

export function startDeepPlan(
  id: string,
  plans: DeepPlan[],
  now: Date = new Date(),
): DeepPlanResult<DeepPlan[]> {
  const plan = plans.find((p) => p.id === id);
  if (!plan) return { ok: false, error: `unknown plan "${id}"` };
  if (plan.status !== "approved") return { ok: false, error: `plan "${id}" is ${plan.status}; approve it before execution starts` };
  return updatePlan(id, plans, now, (p, at) => ({ ...p, status: "started", updatedAt: at }));
}

export function renderDeepPlanMarkdown(plan: DeepPlan): string {
  const revisions = plan.revisions.map((r) => [
    `## Revision ${r.rev}`,
    `- at: ${r.at}`,
    `- note: ${r.note}`,
    "",
    r.content,
  ].join("\n")).join("\n\n");
  return [
    `# ${plan.task}`,
    "",
    `- id: ${plan.id}`,
    `- status: ${plan.status}`,
    `- created: ${plan.createdAt}`,
    `- updated: ${plan.updatedAt}`,
    `- review: ${plan.reviewNote ?? "pending"}`,
    "",
    "Execution is blocked until this plan is approved.",
    "",
    revisions,
    "",
  ].join("\n");
}

export function formatDeepPlanLine(plan: DeepPlan): string {
  const rev = plan.revisions.at(-1)?.rev ?? 0;
  return `${plan.id} · ${plan.status} · rev ${rev} · ${plan.task}`;
}

function updatePlan(
  id: string,
  plans: DeepPlan[],
  now: Date,
  mutate: (plan: DeepPlan, at: string) => DeepPlan,
): DeepPlanResult<DeepPlan[]> {
  const plan = plans.find((p) => p.id === id);
  if (!plan) return { ok: false, error: `unknown plan "${id}"` };
  const at = now.toISOString();
  const next = plans.map((p) => (p.id === id ? mutate(p, at) : p));
  return { ok: true, value: next };
}

function nextPlanId(task: string, existing: DeepPlan[]): string {
  const base = `plan-${slug(task)}`;
  const taken = new Set(existing.map((p) => p.id));
  let n = 1;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

function slug(input: string): string {
  const s = input.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-$/g, "").slice(0, 48);
  return s || "strategy";
}

function initialPlanContent(task: string): string {
  return [
    "## Objective",
    task,
    "",
    "## Proposed Approach",
    "1. Define the intended outcome and non-goals.",
    "2. Identify the files, systems, and review criteria involved.",
    "3. Execute only after this document passes review.",
    "",
    "## Review Gate",
    "Approval required before execution starts.",
  ].join("\n");
}
