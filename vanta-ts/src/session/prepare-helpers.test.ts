import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadPromptContext, loadRuntimeSettings } from "./prepare-helpers.js";
import { buildRegistry } from "../tools/index.js";
import { addBeliefToStore, evidence, saveBeliefStore } from "../operator-profile/beliefs.js";

/**
 * SETTINGS-BLOCKEDTOOLS-ENFORCE: prepareRun loads settings BEFORE buildRegistry
 * and passes {exclude: settings.blockedTools} so a blocked tool is absent from
 * the live session registry. These tests cover that wiring at the seam:
 * loadRuntimeSettings reads blockedTools, and the resulting exclude removes the
 * named tool while the empty/undefined case stays byte-identical to today.
 */
describe("loadRuntimeSettings → blockedTools registry exclusion", () => {
  let root: string;
  let home: string;
  const prevHome = process.env.VANTA_HOME;

  async function writeProjectSettings(settings: Record<string, unknown>): Promise<void> {
    const dir = join(root, ".vanta");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "settings.json"), JSON.stringify(settings), "utf8");
  }

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "vanta-blocked-root-"));
    home = await mkdtemp(join(tmpdir(), "vanta-blocked-home-"));
    // Isolate the user scope so a real ~/.vanta/settings.json never bleeds in.
    process.env.VANTA_HOME = home;
  });

  afterEach(async () => {
    if (prevHome === undefined) delete process.env.VANTA_HOME;
    else process.env.VANTA_HOME = prevHome;
    await rm(root, { recursive: true, force: true });
    await rm(home, { recursive: true, force: true });
  });

  it("excludes a tool listed in settings.blockedTools from the built registry", async () => {
    await writeProjectSettings({ blockedTools: ["read_file"] });

    const settings = await loadRuntimeSettings(root);
    const registry = buildRegistry({ exclude: settings.blockedTools ?? [] });

    expect(settings.blockedTools).toEqual(["read_file"]);
    expect(registry.get("read_file")).toBeUndefined();
    // A non-blocked tool still registers.
    expect(registry.get("write_file")).toBeDefined();
  });

  it("keeps the full registry when blockedTools is empty (byte-identical to today)", async () => {
    await writeProjectSettings({ blockedTools: [] });

    const settings = await loadRuntimeSettings(root);
    const blockedReg = buildRegistry({ exclude: settings.blockedTools ?? [] });
    const fullReg = buildRegistry();

    expect(blockedReg.list().map((t) => t.schema.name).sort())
      .toEqual(fullReg.list().map((t) => t.schema.name).sort());
  });

  it("keeps the full registry when blockedTools is undefined (current behavior)", async () => {
    await writeProjectSettings({}); // no blockedTools key at all

    const settings = await loadRuntimeSettings(root);
    const blockedReg = buildRegistry({ exclude: settings.blockedTools ?? [] });
    const fullReg = buildRegistry();

    expect(settings.blockedTools).toBeUndefined();
    expect(blockedReg.list().map((t) => t.schema.name).sort())
      .toEqual(fullReg.list().map((t) => t.schema.name).sort());
  });

  it("still registers the factory-built tools (mount_mcp / tool_search) when not blocked", async () => {
    await writeProjectSettings({ blockedTools: ["read_file"] });

    const settings = await loadRuntimeSettings(root);
    const registry = buildRegistry({ exclude: settings.blockedTools ?? [] });

    // MCP/plugin registration uses these factory tools; blocking one tool must
    // not collaterally drop them.
    expect(registry.get("mount_mcp")).toBeDefined();
    expect(registry.get("tool_search")).toBeDefined();
  });

  it("loads accepted operator beliefs into the real session prompt context", async () => {
    const store = { version: 1 as const, beliefs: [] };
    const now = new Date("2026-07-10T15:00:00.000Z");
    addBeliefToStore(store, {
      statement: "Keep answers concise",
      facet: "communication",
      status: "accepted",
      confidence: 1,
      evidence: evidence({ kind: "self_report", sourceRef: "session:s1:turn:1", excerpt: "Keep answers concise" }, now),
    }, { now, id: () => "concise" });
    await saveBeliefStore(store, process.env);

    const context = await loadPromptContext(root, []);
    expect(context.brain).toContain("Operator beliefs");
    expect(context.brain).toContain("Keep answers concise");
    expect(context.brain).toContain("Default to concise responses");
    expect(context.brain).toContain("session:s1:turn:1");
  });
});
