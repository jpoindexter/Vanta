import { createHash } from "node:crypto";
import { z } from "zod";

export const ShopifyScopeSchema = z.enum([
  "read_products", "write_products", "read_orders", "read_inventory", "write_inventory",
]);
export type ShopifyScope = z.infer<typeof ShopifyScopeSchema>;

export const ShopifyProfileSchema = z.object({
  version: z.literal(1),
  store: z.string().regex(/^[a-z0-9][a-z0-9-]{0,60}\.myshopify\.com$/),
  apiVersion: z.string().regex(/^20\d{2}-(?:01|04|07|10)$/),
  credentialVaultAlias: z.string().regex(/^[A-Z][A-Z0-9_]{2,63}$/),
  scopes: z.array(ShopifyScopeSchema).min(1).max(5).refine((scopes) => new Set(scopes).size === scopes.length, "scopes must be unique"),
}).strict();
export type ShopifyProfile = z.infer<typeof ShopifyProfileSchema>;

export const ShopifyReadRequestSchema = z.object({
  resource: z.enum(["products", "orders", "inventory"]),
  limit: z.number().int().min(1).max(100).default(25),
  query: z.string().trim().max(500).optional(),
}).strict();
export type ShopifyReadRequest = z.infer<typeof ShopifyReadRequestSchema>;

const Gid = z.string().regex(/^gid:\/\/shopify\/[A-Za-z]+\/\d+$/);
const MutationBase = z.object({
  version: z.literal(1), profile: ShopifyProfileSchema,
  id: z.string().regex(/^shop_[a-zA-Z0-9_-]{8,80}$/),
  idempotencyKey: z.string().uuid(), expiresAt: z.string().datetime({ offset: true }),
}).strict();
const ProductUpdate = MutationBase.extend({
  operation: z.literal("product_update"),
  input: z.object({ id: Gid.refine((id) => id.includes("/Product/")), title: z.string().trim().min(1).max(255).optional(), status: z.enum(["ACTIVE", "ARCHIVED", "DRAFT"]).optional() }).strict()
    .refine((input) => input.title !== undefined || input.status !== undefined, "product update needs title or status"),
}).strict();
const InventorySet = MutationBase.extend({
  operation: z.literal("inventory_set"),
  input: z.object({
    inventoryItemId: Gid.refine((id) => id.includes("/InventoryItem/")),
    locationId: Gid.refine((id) => id.includes("/Location/")),
    quantity: z.number().int().min(0).max(1_000_000),
    compareQuantity: z.number().int().min(0).max(1_000_000).optional(),
  }).strict(),
}).strict();
export const ShopifyMutationPlanSchema = z.discriminatedUnion("operation", [ProductUpdate, InventorySet]);
export type ShopifyMutationPlan = z.infer<typeof ShopifyMutationPlanSchema>;

const READ_SCOPES: Record<ShopifyReadRequest["resource"], ShopifyScope> = {
  products: "read_products", orders: "read_orders", inventory: "read_inventory",
};

export function missingReadScopes(profile: ShopifyProfile, request: ShopifyReadRequest): ShopifyScope[] {
  return profile.scopes.includes(READ_SCOPES[request.resource]) ? [] : [READ_SCOPES[request.resource]];
}

export function missingMutationScopes(plan: ShopifyMutationPlan): ShopifyScope[] {
  const required: ShopifyScope[] = plan.operation === "product_update"
    ? ["write_products", "read_products"] : ["write_inventory", "read_inventory"];
  return required.filter((scope) => !plan.profile.scopes.includes(scope));
}

const READ_DOCUMENTS: Record<ShopifyReadRequest["resource"], string> = {
  products: "query Products($first:Int!,$query:String){products(first:$first,query:$query){nodes{id title status totalInventory updatedAt}}}",
  orders: "query Orders($first:Int!,$query:String){orders(first:$first,query:$query,sortKey:CREATED_AT,reverse:true){nodes{id name createdAt displayFinancialStatus totalPriceSet{shopMoney{amount currencyCode}}}}}",
  inventory: "query Inventory($first:Int!,$query:String){inventoryItems(first:$first,query:$query){nodes{id sku tracked inventoryLevels(first:20){nodes{location{id name} quantities(names:[\"available\"]){name quantity}}}}}}",
};

export function buildReadGraphql(request: ShopifyReadRequest) {
  return { query: READ_DOCUMENTS[request.resource], variables: { first: request.limit, query: request.query ?? null } };
}

export function buildMutationGraphql(plan: ShopifyMutationPlan) {
  if (plan.operation === "product_update") return {
    query: "mutation ProductUpdate($product:ProductUpdateInput!){productUpdate(product:$product){product{id title status updatedAt} userErrors{field message}}}",
    variables: { product: plan.input }, resultKey: "productUpdate", targetId: plan.input.id,
  };
  const quantity = { inventoryItemId: plan.input.inventoryItemId, locationId: plan.input.locationId, quantity: plan.input.quantity, ...(plan.input.compareQuantity === undefined ? {} : { compareQuantity: plan.input.compareQuantity }) };
  return {
    query: "mutation InventorySet($input:InventorySetQuantitiesInput!,$idempotencyKey:String!){inventorySetQuantities(input:$input)@idempotent(key:$idempotencyKey){inventoryAdjustmentGroup{id changes{name delta quantityAfterChange}} userErrors{field message code}}}",
    variables: { input: { name: "available", reason: "correction", referenceDocumentUri: `vanta://shopify/${plan.id}`, quantities: [quantity] }, idempotencyKey: plan.idempotencyKey },
    resultKey: "inventorySetQuantities", targetId: plan.input.inventoryItemId,
  };
}

export function buildVerificationGraphql(plan: ShopifyMutationPlan) {
  return plan.operation === "product_update"
    ? { query: "query VerifyProduct($id:ID!){product(id:$id){id title status updatedAt}}", variables: { id: plan.input.id }, resultKey: "product" }
    : { query: "query VerifyInventory($id:ID!,$location:ID!){inventoryItem(id:$id){id inventoryLevel(locationId:$location){quantities(names:[\"available\"]){name quantity}}}}", variables: { id: plan.input.inventoryItemId, location: plan.input.locationId }, resultKey: "inventoryItem" };
}

export function hashShopifyPayload(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function previewShopifyMutation(plan: ShopifyMutationPlan): string {
  const operation = buildMutationGraphql(plan);
  return [
    `${plan.operation} on ${plan.profile.store}`,
    `target: ${operation.targetId}`,
    `scopes: ${plan.profile.scopes.join(", ")}`,
    `idempotency: ${plan.idempotencyKey}`,
    `expires: ${plan.expiresAt}`,
    `variables sha256: ${hashShopifyPayload(operation.variables)}`,
  ].join("\n");
}
