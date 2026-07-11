import { describe, expect, it } from "vitest";
import { ShopifyMutationPlanSchema, ShopifyProfileSchema, ShopifyReadRequestSchema, buildMutationGraphql, buildReadGraphql, missingMutationScopes, missingReadScopes, previewShopifyMutation } from "./schema.js";

const profile = ShopifyProfileSchema.parse({ version: 1, store: "vanta-dev.myshopify.com", apiVersion: "2026-04", credentialVaultAlias: "SHOPIFY_DEV_TOKEN", scopes: ["read_products", "write_products", "read_inventory", "write_inventory"] });

describe("Shopify schemas", () => {
  it("permits only myshopify domains, versioned API paths, vault aliases, and declared scopes", () => {
    expect(profile.store).toBe("vanta-dev.myshopify.com");
    expect(ShopifyProfileSchema.safeParse({ ...profile, store: "evil.example" }).success).toBe(false);
    expect(ShopifyProfileSchema.safeParse({ ...profile, accessToken: "shpat_secret" }).success).toBe(false);
    expect(ShopifyProfileSchema.safeParse({ ...profile, scopes: ["read_products", "read_products"] }).success).toBe(false);
  });

  it("builds bounded PII-minimized read documents and enforces read scopes", () => {
    const request = ShopifyReadRequestSchema.parse({ resource: "orders", limit: 10 });
    const operation = buildReadGraphql(request);
    expect(operation.query).toContain("totalPriceSet");
    expect(operation.query).not.toMatch(/email|address|customer|phone/i);
    expect(missingReadScopes(profile, request)).toEqual(["read_orders"]);
  });

  it("builds typed product updates with local idempotency and exact preview", () => {
    const plan = ShopifyMutationPlanSchema.parse({ version: 1, operation: "product_update", profile, id: "shop_product_1234", idempotencyKey: "123e4567-e89b-42d3-a456-426614174000", expiresAt: "2026-07-12T00:00:00Z", input: { id: "gid://shopify/Product/123", status: "DRAFT" } });
    expect(missingMutationScopes(plan)).toEqual([]);
    expect(buildMutationGraphql(plan).variables).toEqual({ product: { id: "gid://shopify/Product/123", status: "DRAFT" } });
    expect(previewShopifyMutation(plan)).toContain("variables sha256:");
  });

  it("uses Shopify's idempotent directive for inventory writes", () => {
    const plan = ShopifyMutationPlanSchema.parse({ version: 1, operation: "inventory_set", profile, id: "shop_inventory_1234", idempotencyKey: "123e4567-e89b-42d3-a456-426614174001", expiresAt: "2026-07-12T00:00:00Z", input: { inventoryItemId: "gid://shopify/InventoryItem/1", locationId: "gid://shopify/Location/2", quantity: 7, compareQuantity: 6 } });
    const operation = buildMutationGraphql(plan);
    expect(operation.query).toContain("@idempotent(key:$idempotencyKey)");
    expect(operation.variables).toMatchObject({ idempotencyKey: plan.idempotencyKey, input: { quantities: [{ quantity: 7, compareQuantity: 6 }] } });
  });
});
