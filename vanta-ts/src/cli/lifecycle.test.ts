import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseLifecycleFlags, runLifecycleHooks } from "./lifecycle.js";

describe("parseLifecycleFlags", () => {
  it("strips init flags and leaves normal args", () => {
    const parsed = parseLifecycleFlags(["run", "--init", "ship it", "--output-format", "json"]);
    expect(parsed.rest).toEqual(["run", "ship it", "--output-format", "json"]);
    expect(parsed.flags).toEqual({ init: true, initOnly: false, maintenance: false });
  });

  it("treats maintenance as init-only", () => {
    const parsed = parseLifecycleFlags(["--maintenance"]);
    expect(parsed.rest).toEqual([]);
    expect(parsed.flags).toEqual({ init: true, initOnly: true, maintenance: true });
  });
});

describe("runLifecycleHooks", () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "vanta-life-"));
    await mkdir(join(root, ".vanta"), { recursive: true });
  });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); });

  it("runs Setup for --init and continues the session", async () => {
    const marker = join(root, "marker");
    await writeFile(join(root, ".vanta", "hooks.json"), JSON.stringify({
      Setup: [{ command: `printf setup > ${marker}` }],
    }), "utf8");
    await expect(runLifecycleHooks(root, { init: true, initOnly: false, maintenance: false }, "interactive")).resolves.toBe(false);
    await expect(readFile(marker, "utf8")).resolves.toBe("setup");
  });

  it("runs Setup and SessionStart for --init-only, then stops", async () => {
    const marker = join(root, "marker");
    await writeFile(join(root, ".vanta", "hooks.json"), JSON.stringify({
      Setup: [{ command: `printf setup > ${marker}` }],
      SessionStart: [{ command: `printf start >> ${marker}` }],
    }), "utf8");
    await expect(runLifecycleHooks(root, { init: true, initOnly: true, maintenance: false }, "one-shot")).resolves.toBe(true);
    await expect(readFile(marker, "utf8")).resolves.toBe("setupstart");
  });
});
