import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeSettings } from "./store.js";

let fixture: string;
beforeEach(async () => { fixture = await mkdtemp(join(tmpdir(), "vanta-settings-writer-")); });
afterEach(async () => rm(fixture, { recursive: true, force: true }));

describe("settings writer preserves suspect targets", () => {
  it.each(['{"blockedTools":', '[]', 'null', '"text"', '{"blockedTools":false}', '{"sandbox":{"enabled":"bad"}}'])
    ("refuses to replace corrupt or invalid existing settings %s", async (raw) => {
      const path = join(fixture, "settings.json");
      await writeFile(path, raw);
      await expect(writeSettings(path, { blockedTools: ["shell_cmd"] })).rejects.toThrow(path);
      expect(await readFile(path, "utf8")).toBe(raw);
      expect(await readdir(fixture)).toEqual(["settings.json"]);
    });

  it("rejects non-ENOENT read failures without changing the target", async () => {
    const path = join(fixture, "settings.json"); await mkdir(path);
    await expect(writeSettings(path, { blockedTools: ["shell_cmd"] })).rejects.toThrow(path);
    expect(await readdir(path)).toEqual([]);
  });

  it("creates a missing scope and replaces a valid target without stripping provided keys", async () => {
    const path = join(fixture, "nested", "settings.json");
    const settings = { blockedTools: ["shell_cmd"], futurePreference: { retained: true } };
    await writeSettings(path, settings);
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual(settings);
    const next = { ...settings, effortLevel: "high" as const };
    await writeSettings(path, next);
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual(next);
  });

  it("rejects invalid incoming policy without replacing a valid target", async () => {
    const path = join(fixture, "settings.json");
    const before = '{"blockedTools":["shell_cmd"]}';
    await writeFile(path, before);
    await expect(writeSettings(path, { blockedTools: false } as never)).rejects.toThrow("invalid");
    expect(await readFile(path, "utf8")).toBe(before);
  });

  it("rejects invalid incoming policy before creating a missing scope", async () => {
    const path = join(fixture, "missing", "settings.json");
    await expect(writeSettings(path, { blockedTools: false } as never)).rejects.toThrow("invalid");
    expect(await readdir(fixture)).toEqual([]);
  });
});
