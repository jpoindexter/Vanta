import {
  approveDeepPlan,
  createDeepPlan,
  formatDeepPlanLine,
  persistDeepPlan,
  readDeepPlans,
  requestPlanRevision,
  reviseDeepPlan,
  startDeepPlan,
  writeDeepPlans,
  type DeepPlan,
} from "../plan/deep-planning.js";

export type DeepPlanDeps = {
  read: () => Promise<DeepPlan[]>;
  write: (plans: DeepPlan[]) => Promise<void>;
  persist: (plan: DeepPlan) => Promise<void>;
  env: NodeJS.ProcessEnv;
  now: () => Date;
  log: (line: string) => void;
};

const USAGE = [
  "usage:",
  "  vanta deep-plan create \"<strategy task>\"",
  "  vanta deep-plan list",
  "  vanta deep-plan request-revision <id> \"<reason>\"",
  "  vanta deep-plan revise <id> \"<new plan text>\"",
  "  vanta deep-plan approve <id>",
  "  vanta deep-plan start <id>",
].join("\n");

export async function handleDeepPlan(rest: string[], deps: DeepPlanDeps): Promise<number> {
  const [sub, id, ...args] = rest;
  switch (sub) {
    case "create":
      return createCmd([id, ...args].filter((v): v is string => v !== undefined).join(" "), deps);
    case "list":
      return listCmd(deps);
    case "request-revision":
      return mutateCmd(id, args.join(" "), deps, requestPlanRevision, "revision requested");
    case "revise":
      return mutateCmd(id, args.join(" "), deps, reviseDeepPlan, "revision recorded");
    case "approve":
      return mutateCmd(id, "", deps, (planId, _text, plans, now) => approveDeepPlan(planId, plans, now), "approved");
    case "start":
      return mutateCmd(id, "", deps, (planId, _text, plans, now) => startDeepPlan(planId, plans, now), "started");
    default:
      deps.log(USAGE);
      return sub ? 1 : 0;
  }
}

async function createCmd(task: string, deps: DeepPlanDeps): Promise<number> {
  const plans = await deps.read();
  const result = createDeepPlan(task, plans, deps.now(), deps.env);
  if (!result.ok) {
    deps.log(result.error);
    return 1;
  }
  const next = [...plans, result.value];
  await deps.write(next);
  await deps.persist(result.value);
  deps.log(`created ${formatDeepPlanLine(result.value)}`);
  deps.log(result.value.docPath);
  return 0;
}

async function listCmd(deps: DeepPlanDeps): Promise<number> {
  const plans = await deps.read();
  if (plans.length === 0) {
    deps.log("no deep plans yet");
    return 0;
  }
  for (const plan of plans) deps.log(formatDeepPlanLine(plan));
  return 0;
}

async function mutateCmd(
  id: string | undefined,
  text: string,
  deps: DeepPlanDeps,
  mutate: (id: string, text: string, plans: DeepPlan[], now: Date) => ReturnType<typeof approveDeepPlan>,
  label: string,
): Promise<number> {
  if (!id) {
    deps.log(USAGE);
    return 1;
  }
  const plans = await deps.read();
  const result = mutate(id, text, plans, deps.now());
  if (!result.ok) {
    deps.log(result.error);
    return 1;
  }
  const updated = result.value.find((p) => p.id === id);
  if (!updated) {
    deps.log(`unknown plan "${id}"`);
    return 1;
  }
  await deps.write(result.value);
  await deps.persist(updated);
  deps.log(`${label} ${formatDeepPlanLine(updated)}`);
  deps.log(updated.docPath);
  return 0;
}

function liveDeepPlanDeps(): DeepPlanDeps {
  return {
    read: () => readDeepPlans(),
    write: (plans) => writeDeepPlans(plans),
    persist: (plan) => persistDeepPlan(plan),
    env: process.env,
    now: () => new Date(),
    log: (line) => console.log(line),
  };
}

export async function runDeepPlanCommand(rest: string[]): Promise<number> {
  return handleDeepPlan(rest, liveDeepPlanDeps());
}
