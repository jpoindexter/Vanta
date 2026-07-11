import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { runShopifyCommand } from "./shopify-cmd.js";

let root: string, lines: string[];
const profile = { version: 1, store: "vanta-dev.myshopify.com", apiVersion: "2026-04", credentialVaultAlias: "SHOPIFY_DEV_TOKEN", scopes: ["read_products", "write_products"] };
const plan = { version: 1, operation: "product_update", profile, id: "shop_cli_12345678", idempotencyKey: "123e4567-e89b-42d3-a456-426614174000", expiresAt: "2099-07-12T00:00:00Z", input: { id: "gid://shopify/Product/123", status: "DRAFT" } };
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "vanta-shopify-cli-")); lines = []; await writeFile(join(root, "profile.json"), JSON.stringify(profile)); await writeFile(join(root, "plan.json"), JSON.stringify(plan)); });

describe("vanta shopify", () => {
  it("runs a bounded read", async () => {
    const read = vi.fn(async () => ({ ok: true, state: "ok", data: { products: { nodes: [] } } }));
    expect(await runShopifyCommand(root, ["read", "profile.json", "products", "--limit", "5"], { log: (line) => lines.push(line), read })).toBe(0);
    expect(read).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({ resource: "products", limit: 5 }));
  });

  it("requires exact plan approval before mutation", async () => {
    const mutate = vi.fn();
    expect(await runShopifyCommand(root, ["apply", "plan.json", "--approve", "wrong"], { log: (line) => lines.push(line), mutate })).toBe(1);
    expect(lines.join("\n")).toContain("--approve shop_cli_12345678"); expect(mutate).not.toHaveBeenCalled();
  });

  it("applies once and lists receipts", async () => {
    const mutate = async () => ({ ok: true, state: "verified", data: { product: { id: "gid://shopify/Product/123" } } });
    expect(await runShopifyCommand(root, ["apply", "plan.json", "--approve", plan.id], { log: (line) => lines.push(line), mutate })).toBe(0);
    lines = []; expect(await runShopifyCommand(root, ["receipts"], { log: (line) => lines.push(line) })).toBe(0);
    expect(lines.join("\n")).toContain("verified\tproduct_update\tgid://shopify/Product/123");
  });
});
