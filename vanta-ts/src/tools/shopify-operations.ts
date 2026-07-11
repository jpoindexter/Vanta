import { z } from "zod";
import { readShopify, type ShopifyResult } from "../shopify/client.js";
import { ShopifyMutationPlanSchema, ShopifyProfileSchema, ShopifyReadRequestSchema, missingMutationScopes, previewShopifyMutation, type ShopifyMutationPlan } from "../shopify/schema.js";
import { executeShopifyMutation, type ShopifyMutator } from "../shopify/service.js";
import type { Tool } from "./types.js";

const Args = z.discriminatedUnion("action", [
  z.object({ action: z.literal("read"), profile: ShopifyProfileSchema, request: ShopifyReadRequestSchema }).strict(),
  z.object({ action: z.enum(["preview", "mutate"]), plan: ShopifyMutationPlanSchema }).strict(),
]);
type Deps = { read?: (profile: z.infer<typeof ShopifyProfileSchema>, request: z.infer<typeof ShopifyReadRequestSchema>) => Promise<ShopifyResult>; mutate?: ShopifyMutator };

function formatData(data: unknown): string {
  const json = JSON.stringify(data, null, 2);
  return json.length <= 50_000 ? json : `${json.slice(0, 50_000)}\n[output clipped at 50,000 characters]`;
}

function preview(plan: ShopifyMutationPlan): string {
  const missing = missingMutationScopes(plan);
  return `${previewShopifyMutation(plan)}\n${missing.length > 0 ? `blocked: missing ${missing.join(", ")}` : "eligible for fresh approval"}`;
}

export function buildShopifyOperationsTool(deps: Deps = {}): Tool {
  return {
    schema: {
      name: "shopify_operations",
      description: "Read bounded products/orders/inventory or preview and fresh-approval-gate typed product/inventory mutations. Store tokens resolve from scoped vault aliases and never enter arguments or receipts.",
      parameters: { type: "object", required: ["action"], properties: { action: { type: "string", enum: ["read", "preview", "mutate"] }, profile: { type: "object" }, request: { type: "object" }, plan: { type: "object" } } },
    },
    describeForSafety: (raw) => raw.action === "mutate" ? `mutate Shopify plan ${String((raw.plan as { id?: string })?.id ?? "unknown")}` : "inspect Shopify operations",
    async execute(raw, ctx) {
      const parsed = Args.safeParse(raw);
      if (!parsed.success) return { ok: false, output: `invalid Shopify request: ${parsed.error.issues[0]?.message ?? "invalid input"}` };
      if (parsed.data.action === "read") {
        const result = await (deps.read ?? readShopify)(parsed.data.profile, parsed.data.request);
        return { ok: result.ok, output: result.ok ? formatData(result.data) : `Shopify read stopped: ${result.state}` };
      }
      if (parsed.data.action === "preview") return { ok: missingMutationScopes(parsed.data.plan).length === 0, output: preview(parsed.data.plan) };
      const result = await executeShopifyMutation(ctx.root, parsed.data.plan, {
        mutate: deps.mutate,
        approve: (detail) => ctx.requestApproval(
          `Apply this exact Shopify mutation:\n${detail}`,
          "writes Shopify state once and verifies the resulting object",
          "shopify_operations",
          { diff: detail, fresh: true },
        ),
      });
      return { ok: result.ok, output: result.ok ? `Shopify mutation verified; receipt recorded` : `Shopify mutation stopped: ${result.state}` };
    },
  };
}

export const shopifyOperationsTool = buildShopifyOperationsTool();
