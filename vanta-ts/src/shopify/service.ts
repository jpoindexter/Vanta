import { mutateShopify, type ShopifyClientDeps, type ShopifyResult } from "./client.js";
import { missingMutationScopes, previewShopifyMutation, type ShopifyMutationPlan } from "./schema.js";
import { appendShopifyReceipt, buildShopifyReceipt, loadShopifyReceipts, withShopifyReceiptLock } from "./receipts.js";

export type ShopifyApproval = (preview: string) => Promise<boolean>;
export type ShopifyMutator = (plan: ShopifyMutationPlan) => Promise<ShopifyResult>;
export type ShopifyServiceDeps = ShopifyClientDeps & { approve: ShopifyApproval; mutate?: ShopifyMutator; now?: () => Date };
export type ShopifyExecution = { ok: boolean; state: string; preview: string; receiptRecorded: boolean };

function eligibility(plan: ShopifyMutationPlan, receipts: readonly { planId: string }[], now: Date): string[] {
  const issues = missingMutationScopes(plan).map((scope) => `missing scope ${scope}`);
  if (Date.parse(plan.expiresAt) <= now.getTime()) issues.push("mutation plan expired");
  if (receipts.some((receipt) => receipt.planId === plan.id)) issues.push("mutation plan already has a receipt");
  return issues;
}

async function record(root: string, plan: ShopifyMutationPlan, input: Parameters<typeof buildShopifyReceipt>[1]): Promise<void> {
  await appendShopifyReceipt(root, buildShopifyReceipt(plan, input));
}

async function reserve(root: string, plan: ShopifyMutationPlan, now: Date): Promise<string[]> {
  return withShopifyReceiptLock(root, async () => {
    const issues = eligibility(plan, await loadShopifyReceipts(root), now);
    if (issues.length > 0) return issues;
    await record(root, plan, { at: now.toISOString(), status: "reserved", state: "reserved" });
    return [];
  });
}

export async function executeShopifyMutation(root: string, plan: ShopifyMutationPlan, deps: ShopifyServiceDeps): Promise<ShopifyExecution> {
  const clock = deps.now ?? (() => new Date()), preview = previewShopifyMutation(plan);
  const initial = eligibility(plan, await loadShopifyReceipts(root), clock());
  if (initial.length > 0) return { ok: false, state: `blocked: ${initial.join("; ")}`, preview, receiptRecorded: false };
  if (!await deps.approve(preview)) {
    await withShopifyReceiptLock(root, () => record(root, plan, { at: clock().toISOString(), status: "denied", state: "operator_denied" }));
    return { ok: false, state: "operator_denied", preview, receiptRecorded: true };
  }
  const afterApproval = await reserve(root, plan, clock());
  if (afterApproval.length > 0) return { ok: false, state: `blocked: ${afterApproval.join("; ")}`, preview, receiptRecorded: false };
  let result: ShopifyResult;
  try { result = await (deps.mutate ?? ((value) => mutateShopify(value, deps)))(plan); }
  catch { result = { ok: false, state: "client_error" }; }
  await withShopifyReceiptLock(root, () => record(root, plan, {
    at: clock().toISOString(), status: result.ok ? "verified" : "failed", state: result.state,
    result: result.data, userErrorCount: result.userErrorCount,
  }));
  return { ok: result.ok, state: result.state, preview, receiptRecorded: true };
}
