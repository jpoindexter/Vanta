import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { buildShopifyOperationsTool } from "./shopify-operations.js";

const profile = { version: 1, store: "vanta-dev.myshopify.com", apiVersion: "2026-04", credentialVaultAlias: "SHOPIFY_DEV_TOKEN", scopes: ["read_products", "write_products"] };
const plan = { version: 1, operation: "product_update", profile, id: "shop_tool_12345678", idempotencyKey: "123e4567-e89b-42d3-a456-426614174000", expiresAt: "2099-07-12T00:00:00Z", input: { id: "gid://shopify/Product/123", status: "DRAFT" } };

describe("shopify_operations tool", () => {
  it("returns bounded read data without approval", async () => {
    const requestApproval = vi.fn();
    const tool = buildShopifyOperationsTool({ read: async () => ({ ok: true, state: "ok", data: { products: { nodes: [{ id: "gid://shopify/Product/1", title: "One" }] } } }) });
    const result = await tool.execute({ action: "read", profile, request: { resource: "products", limit: 1 } }, { root: "/tmp", safety: {} as never, requestApproval });
    expect(result).toMatchObject({ ok: true }); expect(result.output).toContain("Product/1"); expect(requestApproval).not.toHaveBeenCalled();
  });

  it("requires fresh approval for mutation and stops on denial", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-shopify-tool-")), requestApproval = vi.fn(async () => false), mutate = vi.fn();
    const result = await buildShopifyOperationsTool({ mutate }).execute({ action: "mutate", plan }, { root, safety: {} as never, requestApproval });
    expect(result).toMatchObject({ ok: false }); expect(mutate).not.toHaveBeenCalled();
    expect(requestApproval).toHaveBeenCalledWith(expect.stringContaining("product_update"), expect.any(String), "shopify_operations", expect.objectContaining({ fresh: true }));
  });

  it("records a verified mutation without exposing provider data", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-shopify-tool-"));
    const tool = buildShopifyOperationsTool({ mutate: async () => ({ ok: true, state: "verified", data: { product: { id: "gid://shopify/Product/123" } } }) });
    expect(await tool.execute({ action: "mutate", plan: { ...plan, id: "shop_tool_success1" } }, { root, safety: {} as never, requestApproval: async () => true })).toEqual({ ok: true, output: "Shopify mutation verified; receipt recorded" });
  });
});
