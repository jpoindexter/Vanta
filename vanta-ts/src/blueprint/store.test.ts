import { describe, it, expect, beforeEach } from "vitest";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listBlueprints, getBlueprint } from "./store.js";

// VANTA-BLUEPRINTS store — bundled + user blueprints, user overrides bundled.

describe("blueprint store", () => {
  it("loads the bundled vanta-tool blueprint out of the box", async () => {
    const env = { VANTA_HOME: await mkdtemp(join(tmpdir(), "vanta-bp-")) };
    const bundled = await getBlueprint("vanta-tool", env);
    expect(bundled?.name).toBe("vanta-tool");
    expect(bundled?.files.length).toBeGreaterThanOrEqual(2);
  });

  it("a user blueprint is added without touching src/ and overrides a bundled one by name", async () => {
    const home = await mkdtemp(join(tmpdir(), "vanta-bp-"));
    const env = { VANTA_HOME: home };
    await mkdir(join(home, "blueprints", "vanta-tool"), { recursive: true });
    await writeFile(
      join(home, "blueprints", "vanta-tool", "blueprint.json"),
      JSON.stringify({ name: "vanta-tool", description: "USER OVERRIDE", files: [{ path: "x.ts", content: "y" }] }),
      "utf8",
    );
    const bp = await getBlueprint("vanta-tool", env);
    expect(bp?.description).toBe("USER OVERRIDE"); // user wins over bundled
    const all = await listBlueprints(env);
    expect(all.filter((b) => b.name === "vanta-tool")).toHaveLength(1); // deduped by name
  });

  it("returns null for an unknown blueprint", async () => {
    expect(await getBlueprint("nope", { VANTA_HOME: await mkdtemp(join(tmpdir(), "vanta-bp-")) })).toBeNull();
  });
});
