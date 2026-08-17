import { effectiveNdSupport } from "../nd/profile.js";
import { reconcileLegacySources } from "./legacy.js";
import type { ContinuityDiagnostic, ContinuitySnapshot, ContinuityStore } from "./types.js";
import { projectWorkItems } from "../work-items/projections.js";
import { buildOperatorSpine } from "../work-items/operator-spine.js";

export type SnapshotOptions = {
  env: NodeJS.ProcessEnv;
  now: Date;
  sessionOff?: boolean;
  refusalScope?: "session" | "pattern" | "global";
  diagnostics?: ContinuityDiagnostic[];
};

function activeItems(store: ContinuityStore) {
  return store.items
    .filter((item) => !["stopped", "failed", "verified"].includes(item.state))
    .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt));
}

function sourceDiagnostics(
  operator: Awaited<ReturnType<typeof buildOperatorSpine>>,
  diagnostics: ContinuityDiagnostic[] = [],
): ContinuityDiagnostic[] {
  const issue = operator.sources.find((entry) =>
    entry.status === "degraded" || entry.status === "unreadable",
  );
  if (!issue) return diagnostics;
  return [
    ...diagnostics,
    {
      code: "operator_source_unreadable",
      message: `${issue.kind} reconciliation is ${issue.status}`,
      recovery: `Inspect ${issue.path}; Vanta left the source untouched.`,
    },
  ];
}

function effectiveRefusalScope(
  options: SnapshotOptions,
  patternOff: boolean,
  globalOff: boolean,
): SnapshotOptions["refusalScope"] {
  if (options.refusalScope) return options.refusalScope;
  if (options.sessionOff) return "session";
  if (globalOff) return "global";
  return patternOff ? "pattern" : undefined;
}

export async function buildContinuitySnapshot(
  root: string,
  store: ContinuityStore,
  options: SnapshotOptions,
): Promise<ContinuitySnapshot> {
  const [support, operator] = await Promise.all([
    effectiveNdSupport(options.env, options.now),
    buildOperatorSpine(root, { env: options.env, now: options.now }),
  ]);
  const patternOff = support.refusals.patterns.includes("today-recommendation");
  const active = activeItems(store);
  const projections = projectWorkItems(
    [...store.items].sort((left, right) => left.updatedAt.localeCompare(right.updatedAt)),
  );
  const waiting = active.find((item) => item.state === "waiting" && item.nextAction);
  const diagnostics = sourceDiagnostics(operator, options.diagnostics);
  const refusalScope = effectiveRefusalScope(options, patternOff, support.refusals.global);
  return {
    integrity: diagnostics.length ? "degraded" : "ok",
    diagnostics,
    today: refusalScope ? [] : active.slice(0, 1),
    inbox: active,
    projects: [{ id: "current", label: "Current project", itemCount: store.items.length }],
    runs: store.runs,
    approvals: store.approvals,
    receipts: store.receipts,
    projections,
    legacy: { reconciledAt: options.now.toISOString(), sources: await reconcileLegacySources(root, options.env) },
    operator,
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
