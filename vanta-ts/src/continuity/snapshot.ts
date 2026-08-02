import { effectiveNdSupport } from "../nd/profile.js";
import { reconcileLegacySources } from "./legacy.js";
import type { ContinuityDiagnostic, ContinuitySnapshot, ContinuityStore } from "./types.js";
import { projectWorkItems } from "../work-items/projections.js";

export type SnapshotOptions = {
  env: NodeJS.ProcessEnv;
  now: Date;
  sessionOff?: boolean;
  refusalScope?: "session" | "pattern" | "global";
  diagnostics?: ContinuityDiagnostic[];
};

export async function buildContinuitySnapshot(
  root: string,
  store: ContinuityStore,
  options: SnapshotOptions,
): Promise<ContinuitySnapshot> {
  const support = await effectiveNdSupport(options.env, options.now);
  const patternOff = support.refusals.patterns.includes("today-recommendation");
  const active = store.items
    .filter((item) => !["stopped", "failed", "verified"].includes(item.state))
    .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt));
  const projections = projectWorkItems(
    [...store.items].sort((left, right) => left.updatedAt.localeCompare(right.updatedAt)),
  );
  const waiting = active.find((item) => item.state === "waiting" && item.nextAction);
  const refusalScope = options.refusalScope
    ?? (options.sessionOff ? "session" : support.refusals.global ? "global" : patternOff ? "pattern" : undefined);
  return {
    integrity: options.diagnostics?.length ? "degraded" : "ok",
    diagnostics: options.diagnostics ?? [],
    today: refusalScope ? [] : active.slice(0, 1),
    inbox: active,
    projects: [{ id: "current", label: "Current project", itemCount: store.items.length }],
    runs: store.runs,
    approvals: store.approvals,
    receipts: store.receipts,
    projections,
    legacy: { reconciledAt: options.now.toISOString(), sources: await reconcileLegacySources(root, options.env) },
    support: {
      capacity: support.capacity,
      transient: support.transient,
      quietHours: support.quietHours,
      interruptionBudget: { daily: support.interruptionBudget.daily, remaining: support.interruptionBudget.daily },
      interaction: support.interaction,
      refusal: refusalScope ? { active: true, scope: refusalScope } : { active: false },
    },
    ...(waiting?.nextAction ? { reentry: { itemId: waiting.id, action: waiting.nextAction } } : {}),
  };
}
