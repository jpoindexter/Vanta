import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { desktopProviderOptions, desktopProviderOptionsLive, resolveDesktopProviderSelection } from "./handlers.js";
import type { ProviderEntry } from "../providers/catalog.js";

describe("desktop provider aliases", () => {
  let home: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "vanta-desktop-provider-"));
    await mkdir(home, { recursive: true });
    await writeFile(join(home, "providers.json"), JSON.stringify({
      providers: {
        myrouter: { baseURL: "https://router.example/v1", keyEnv: "ROUTER_KEY", model: "router-default" },
      },
    }));
  });

  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  it("includes user-declared aliases in the desktop model list", () => {
    const options = desktopProviderOptions({ VANTA_HOME: home, VANTA_PROVIDER: "myrouter" });
    expect(options).toContainEqual(expect.objectContaining({
      id: "myrouter",
      defaultModel: "router-default",
      models: ["router-default"],
      current: true,
    }));
  });

  it("lists the current OpenAI agent model family", () => {
    const openai = desktopProviderOptions({ VANTA_HOME: home }).find((option) => option.id === "openai");

    expect(openai?.models).toEqual(expect.arrayContaining([
      "gpt-5.6",
      "gpt-5.6-sol",
      "gpt-5.6-terra",
      "gpt-5.6-luna",
      "gpt-5.5",
      "gpt-5.5-pro",
      "gpt-5.4",
      "gpt-5.4-pro",
      "gpt-5.4-mini",
      "gpt-5.4-nano",
      "gpt-5.3-codex",
      "gpt-5.2",
      "gpt-5.2-pro",
      "gpt-5.1",
      "gpt-5",
      "gpt-5-pro",
      "gpt-5-mini",
      "gpt-5-nano",
      "o3-pro",
    ]));
  });

  it("lists current Codex subscription agent models", () => {
    const codex = desktopProviderOptions({ VANTA_HOME: home }).find((option) => option.id === "codex");

    expect(codex?.models).toEqual(expect.arrayContaining([
      "gpt-5.6",
      "gpt-5.6-sol",
      "gpt-5.6-terra",
      "gpt-5.6-luna",
      "gpt-5.5-pro",
      "gpt-5.4-pro",
      "gpt-5.4-nano",
      "gpt-5.3-codex",
      "gpt-5.3-codex-spark",
      "gpt-5.2",
      "gpt-5.2-pro",
      "gpt-5.2-codex",
      "gpt-5.1",
      "gpt-5.1-codex-max",
      "gpt-5.1-codex",
      "gpt-5.1-codex-mini",
      "gpt-5",
      "gpt-5-pro",
      "gpt-5-mini",
      "gpt-5-nano",
      "gpt-5-codex",
      "gpt-5-codex-mini",
    ]));
  });

  it("uses a refreshed catalog when the desktop picker opens without dropping bundled models", async () => {
    const refreshed: ProviderEntry[] = [{
      id: "openai", label: "OpenAI", short: "OpenAI", envVar: "OPENAI_API_KEY",
      defaultModel: "gpt-current", models: ["gpt-current"],
    }];

    await expect(desktopProviderOptionsLive({ VANTA_HOME: home }, async () => refreshed)).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "openai", models: expect.arrayContaining(["gpt-current", "gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"]) }),
    ]));
  });

  it("provider-only selection uses the alias model and credential instead of the parent model", () => {
    const selected = resolveDesktopProviderSelection({
      VANTA_HOME: home,
      VANTA_PROVIDER: "openai",
      VANTA_MODEL: "gpt-4o",
      ROUTER_KEY: "opaque-key",
    }, "myrouter");

    expect(selected.provider).toBe("myrouter");
    expect(selected.model).toBe("router-default");
    expect(selected.env.VANTA_MODEL).toBeUndefined();
    expect(selected.resolved.modelId()).toBe("router-default");
  });

  it("fails before selection when the alias credential environment is missing", () => {
    expect(() => resolveDesktopProviderSelection({ VANTA_HOME: home }, "myrouter")).toThrow(/ROUTER_KEY/);
  });
});
