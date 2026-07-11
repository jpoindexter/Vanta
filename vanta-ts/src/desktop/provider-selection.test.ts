import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { desktopProviderOptions, resolveDesktopProviderSelection } from "./handlers.js";

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
