import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { once } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ShopifyMutationPlanSchema, ShopifyProfileSchema, ShopifyReadRequestSchema } from "./schema.js";
import { mutateShopify, readShopify } from "./client.js";

const profile = ShopifyProfileSchema.parse({ version: 1, store: "vanta-dev.myshopify.com", apiVersion: "2026-04", credentialVaultAlias: "SHOPIFY_DEV_TOKEN", scopes: ["read_products", "write_products", "read_orders", "read_inventory", "write_inventory"] });
const servers: ReturnType<typeof createServer>[] = [];

async function fixture(responder: (body: Record<string, unknown>, req: IncomingMessage) => unknown): Promise<string> {
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
    const output = JSON.stringify(responder(body, req));
    res.writeHead(200, { "content-type": "application/json", "content-length": Buffer.byteLength(output) }); res.end(output);
  });
  servers.push(server); server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); if (!address || typeof address === "string") throw new Error("fixture address missing");
  return `http://127.0.0.1:${address.port}/graphql.json`;
}

afterEach(async () => { for (const server of servers.splice(0)) { server.close(); await once(server, "close"); } });

describe("Shopify client", () => {
  it("runs a bounded read through a real local HTTP fixture without returning the token", async () => {
    let receivedToken = "";
    const apiBase = await fixture((_body, req) => { receivedToken = String(req.headers["x-shopify-access-token"]); return { data: { orders: { nodes: [{ id: "gid://shopify/Order/1", name: "#1", totalPriceSet: { shopMoney: { amount: "5.00", currencyCode: "USD" } } }] } } }; });
    const result = await readShopify(profile, ShopifyReadRequestSchema.parse({ resource: "orders", limit: 1 }), { apiBase, resolveToken: async () => "shpat_fixture_secret" });
    expect(result).toMatchObject({ ok: true, state: "ok", httpStatus: 200 });
    expect(receivedToken).toBe("shpat_fixture_secret");
    expect(JSON.stringify(result)).not.toContain("shpat_fixture_secret");
  });

  it("executes a typed product mutation and verifies the object with a second request", async () => {
    let calls = 0;
    const apiBase = await fixture((body) => {
      calls += 1; const query = String(body.query);
      return query.includes("mutation ProductUpdate")
        ? { data: { productUpdate: { product: { id: "gid://shopify/Product/123" }, userErrors: [] } } }
        : { data: { product: { id: "gid://shopify/Product/123", title: "New title", status: "ACTIVE", updatedAt: "2026-07-11T00:00:00Z" } } };
    });
    const plan = ShopifyMutationPlanSchema.parse({ version: 1, operation: "product_update", profile, id: "shop_product_client1", idempotencyKey: "123e4567-e89b-42d3-a456-426614174000", expiresAt: "2099-07-12T00:00:00Z", input: { id: "gid://shopify/Product/123", title: "New title" } });
    expect(await mutateShopify(plan, { apiBase, resolveToken: async () => "secret" })).toMatchObject({ ok: true, state: "verified", userErrorCount: 0 });
    expect(calls).toBe(2);
  });

  it("stops on userErrors without issuing verification", async () => {
    let calls = 0;
    const apiBase = await fixture(() => { calls += 1; return { data: { productUpdate: { product: null, userErrors: [{ field: ["title"], message: "invalid" }] } } }; });
    const plan = ShopifyMutationPlanSchema.parse({ version: 1, operation: "product_update", profile, id: "shop_product_errors1", idempotencyKey: "123e4567-e89b-42d3-a456-426614174000", expiresAt: "2099-07-12T00:00:00Z", input: { id: "gid://shopify/Product/123", title: "New title" } });
    expect(await mutateShopify(plan, { apiBase, resolveToken: async () => "secret" })).toMatchObject({ ok: false, state: "user_errors", userErrorCount: 1 });
    expect(calls).toBe(1);
  });

  it("refuses undeclared scopes before resolving credentials or fetching", async () => {
    const resolveToken = vi.fn(), fetch = vi.fn();
    const narrow = { ...profile, scopes: ["read_products" as const] };
    expect(await readShopify(narrow, ShopifyReadRequestSchema.parse({ resource: "orders" }), { resolveToken, fetch })).toEqual({ ok: false, state: "scope_denied" });
    expect(resolveToken).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
});
