import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { desktopProviderOptionsLive } from "./handler-provider-catalog.js";

describe("automatic Desktop account model discovery", () => {
  let home: string;
  let env: NodeJS.ProcessEnv;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "vanta-model-discovery-"));
    env = { VANTA_HOME: home, CODEX_HOME: home, VANTA_PROVIDER: "codex", VANTA_MODEL: "gpt-5.6-sol" };
  });

  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  async function cache(slugs: string[]) {
    await writeFile(join(home, "models_cache.json"), JSON.stringify({
      models: [
        ...slugs.map((slug) => ({ slug, visibility: "list" })),
        { slug: "hidden-internal-model", visibility: "hide" },
      ],
    }));
  }

  async function codex() {
    return (await desktopProviderOptionsLive(env, async () => [])).find((option) => option.id === "codex");
  }

  it("loads account models on the ordinary request without a manual refresh", async () => {
    await cache(["gpt-6.1-sol", "gpt-6-astra", "future-account-model", "gpt-5.6-sol"]);
    expect(await codex()).toMatchObject({
      models: ["gpt-6.1-sol", "gpt-6-astra", "future-account-model", "gpt-5.6-sol"],
      modelSource: "live", savedDefaultModel: "gpt-5.6-sol", current: true,
    });
    expect(env.VANTA_MODEL).toBe("gpt-5.6-sol");
  });

  it("picks up cache changes on the next ordinary refresh without keeping withdrawn models", async () => {
    await cache(["gpt-6-astra"]);
    expect((await codex())?.models).toEqual(["gpt-6-astra"]);
    await cache(["next-account-model"]);
    expect((await codex())?.models).toEqual(["next-account-model"]);
  });

  it("uses local Codex discovery without polling unrelated provider APIs", async () => {
    const discover = vi.fn(async () => ({ models: ["gpt-6-astra"], source: "live" as const, available: true }));
    const options = await desktopProviderOptionsLive({ ...env, VANTA_PROVIDER: "openai" }, async () => [], undefined, discover);
    expect(discover).toHaveBeenCalledExactlyOnceWith("codex", { ...env, VANTA_PROVIDER: "openai" });
    expect(options.find((option) => option.id === "codex")?.models).toEqual(["gpt-6-astra"]);
    expect(options.find((option) => option.id === "openai")?.modelSource).toBe("catalog");
  });

  it("keeps an honestly labelled offline fallback if the account cache cannot be read", async () => {
    await writeFile(join(home, "models_cache.json"), "not json");
    const option = await codex();
    expect(option?.models).toContain("gpt-5.6-sol");
    expect(option?.modelSource).toBe("catalog");
    expect(option?.discoveryError).toMatch(/unavailable/);
    expect(option?.savedDefaultModel).toBe("gpt-5.6-sol");
  });
});
