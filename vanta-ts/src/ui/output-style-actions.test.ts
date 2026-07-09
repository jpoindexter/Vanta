import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadOutputStyleData, persistOutputStyle } from "./output-style-actions.js";
import { localSettingsPath } from "../settings/store.js";

describe("output style actions", () => {
  let root: string;
  let home: string;
  let env: NodeJS.ProcessEnv;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "vanta-style-root-"));
    home = await mkdtemp(join(tmpdir(), "vanta-style-home-"));
    env = { VANTA_HOME: home, HOME: home };
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
    await rm(home, { recursive: true, force: true });
  });

  it("lists built-ins and custom styles", async () => {
    const dir = join(root, ".claude", "output-styles");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "operator.md"), "---\nname: operator\ndescription: direct\n---\nBe direct.", "utf8");

    const data = await loadOutputStyleData(root, env);
    expect(data.options.map((o) => o.name)).toContain("concise");
    expect(data.options.map((o) => o.name)).toContain("operator");
  });

  it("persists the selected style to local settings and live env", async () => {
    await persistOutputStyle(root, "verbose", env);
    expect(env.VANTA_OUTPUT_STYLE).toBe("verbose");
    const raw = JSON.parse(await readFile(localSettingsPath(root), "utf8"));
    expect(raw.ui.outputStyle).toBe("verbose");
  });
});
