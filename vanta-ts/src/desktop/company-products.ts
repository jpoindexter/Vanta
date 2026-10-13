import type { RevisionRecord } from "../cofounder/outcome-approval.js";
import type { WorkProduct } from "../cofounder/work-products.js";
import { redactForLog } from "../store/redact-structural.js";
import type { WorkProductView } from "./company-schemas.js";

export const ARTIFACT_MAX_CHARS = 16 * 1024;

/**
 * Work product with provenance. The artifact body is worker output, so it is
 * redacted and capped before it leaves the server. `ticketId` is the source
 * task id (a ticket and its task share an id).
 */
export function productView(product: WorkProduct, revisions: RevisionRecord[]): WorkProductView {
  const truncated = product.artifact.length > ARTIFACT_MAX_CHARS;
  const body = truncated ? product.artifact.slice(0, ARTIFACT_MAX_CHARS) : product.artifact;
  return {
    id: product.id,
    ticketId: product.sourceTaskId,
    kind: product.kind,
    artifact: redactForLog(body),
    truncated,
    approved: product.approved,
    createdAt: product.createdAt,
    provenance: { taskId: product.sourceTaskId, workerId: product.producedBy, departmentId: product.departmentId },
    revisions: revisions.filter((r) => r.workProductId === product.id).map((r) => ({ reason: redactForLog(r.reason), at: r.at })),
  };
}

export function productViews(products: WorkProduct[], revisions: RevisionRecord[]): WorkProductView[] {
  return [...products]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))
    .map((p) => productView(p, revisions));
}
