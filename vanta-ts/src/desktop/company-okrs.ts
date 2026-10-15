import { furthestFromTarget, keyResultProgress, objectiveProgress, type Objective } from "../cofounder/okr.js";
import { readObjectives } from "../cofounder/okr-store.js";
import type { CompanyCtx } from "./company-context.js";
import type { z } from "zod";
import type { ObjectiveViewSchema, OkrsResponseSchema } from "./company-finance-schemas.js";

export type OkrsResponse = z.infer<typeof OkrsResponseSchema>;
export type ObjectiveView = z.infer<typeof ObjectiveViewSchema>;

export function objectiveView(o: Objective): ObjectiveView {
  return {
    id: o.id,
    title: o.title,
    departmentId: o.departmentId ?? null,
    progress: objectiveProgress(o),
    keyResults: o.keyResults.map((kr) => ({ name: kr.name, current: kr.current, target: kr.target, progress: keyResultProgress(kr) })),
    updatedAt: o.updatedAt,
  };
}

export async function buildOkrs(ctx: CompanyCtx): Promise<OkrsResponse> {
  const objectives = await readObjectives(ctx.env);
  const furthest = furthestFromTarget(objectives);
  return {
    objectives: objectives.map(objectiveView),
    furthest: furthest ? { objectiveId: furthest.objective.id, keyResult: furthest.keyResult.name, gap: furthest.gap } : null,
  };
}
