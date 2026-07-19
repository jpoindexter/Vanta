import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { clearProviderAuthRequired, loadProviderAuthRequired, providerAuthRequiredPath, saveProviderAuthRequired } from "./provider-auth-store.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe("desktop provider authentication hold", () => {
  it("survives restart without persisting credentials", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-provider-auth-"));
    roots.push(root);
    const value = { provider: "openai", model: "gpt-5.6-sol", baseRoute: "https://api.openai.com/v1", billingMode: "metered" as const, authMethod: "api_key" as const };

    await saveProviderAuthRequired(root, value);

    await expect(loadProviderAuthRequired(root)).resolves.toEqual(value);
    const raw = await readFile(providerAuthRequiredPath(root), "utf8");
    expect(raw).not.toContain("sk-");
    await clearProviderAuthRequired(root);
    await expect(loadProviderAuthRequired(root)).resolves.toBeUndefined();
  });
});
