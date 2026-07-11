import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getAutomationBlueprint, listAutomationBlueprints } from "./catalog.js";
import { previewAutomation } from "./runtime.js";

describe("automation blueprint catalog", () => {
  it("ships reusable schedule and webhook blueprints", async () => {
    const blueprints = await listAutomationBlueprints({ VANTA_HOME: await mkdtemp(join(tmpdir(), "vanta-auto-home-")) });
    expect(blueprints.some((item) => item.kind === "schedule")).toBe(true);
    expect(blueprints.some((item) => item.kind === "webhook")).toBe(true);
    expect(blueprints.map((item) => item.name)).toContain("daily-brief");
    expect(blueprints.map((item) => item.name)).toContain("github-pr-review");
  });

  it("loads user blueprints outside src and lets them override bundled definitions", async () => {
    const home = await mkdtemp(join(tmpdir(), "vanta-auto-home-"));
    const directory = join(home, "automation-blueprints", "daily-brief");
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "blueprint.json"), JSON.stringify({
      name: "daily-brief", description: "My brief", kind: "schedule",
      fields: [{ key: "cron", label: "When", default: "0 8 * * *" }],
      schedule: { cron: "{{cron}}", instruction: "Prepare my private brief" },
    }));
    expect((await getAutomationBlueprint("daily-brief", { VANTA_HOME: home }))?.description).toBe("My brief");
  });

  it("reports only missing fields and previews without writing state", async () => {
    const blueprint = await getAutomationBlueprint("github-pr-review", {
      VANTA_HOME: await mkdtemp(join(tmpdir(), "vanta-auto-home-")),
    });
    expect(blueprint).not.toBeNull();
    const missing = previewAutomation(blueprint!, { id: "review-pr" });
    expect(missing).toEqual({ missing: ["deliver"] });
    const preview = previewAutomation(blueprint!, { id: "review-pr", deliver: "local" });
    expect(preview).toMatchObject({ kind: "webhook", blueprint: "github-pr-review", targetId: "review-pr" });
    expect(JSON.stringify(preview)).not.toContain("secret");
  });
});
