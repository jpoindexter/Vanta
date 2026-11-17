import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startControlHarness, type ControlHarness } from "./__fixtures__/control-harness.js";
import { buildRegistry } from "../tools/index.js";
import { loadSettings } from "../settings/store.js";

let h: ControlHarness;
beforeEach(async () => { h = await startControlHarness(); });
afterEach(async () => { await h.stop(); });

const row = async (name: string) => ((await h.get("/api/tools/toolsets")).body as Array<{ name: string; enabled: boolean }>).find((item) => item.name === name);

describe("tool toggles", () => {
  it("lists every registered tool as enabled by default", async () => {
    const rows = (await h.get("/api/tools/toolsets")).body as Array<{ name: string; tools: string[]; enabled: boolean }>;
    expect(rows.length).toBe(buildRegistry().schemas().length);
    expect(rows.every((item) => item.enabled && item.tools[0] === item.name)).toBe(true);
  });

  it("blocks and unblocks a tool in user settings, and the next session registry honours it", async () => {
    await writeFile(join(h.home, "settings.json"), JSON.stringify({ allowedTools: ["read_file"] }));
    expect((await h.post("/api/tools/toolsets/web_fetch", { enabled: false })).body).toMatchObject({ ok: true, enabled: false, appliesNextSession: true });
    expect((await row("web_fetch"))?.enabled).toBe(false);
    const settings = await loadSettings(h.root, process.env);
    expect(buildRegistry({ exclude: settings.blockedTools }).schemas().some((tool) => tool.name === "web_fetch")).toBe(false);
    expect(JSON.parse(await readFile(join(h.home, "settings.json"), "utf8")).allowedTools).toEqual(["read_file"]);

    await h.post("/api/tools/toolsets/web_fetch", { enabled: true });
    expect((await row("web_fetch"))?.enabled).toBe(true);
    expect(JSON.parse(await readFile(join(h.home, "settings.json"), "utf8")).blockedTools).toBeUndefined();
  });

  it("explains when a project setting keeps the tool blocked", async () => {
    await mkdir(join(h.root, ".vanta"), { recursive: true });
    await writeFile(join(h.root, ".vanta", "settings.json"), JSON.stringify({ blockedTools: ["web_fetch"] }));
    const answer = await h.post("/api/tools/toolsets/web_fetch", { enabled: true });
    expect(answer.status).toBe(409);
    expect(answer.body.error).toContain(".vanta/settings.json");
  });

  it("rejects unknown tools and malformed bodies", async () => {
    expect((await h.post("/api/tools/toolsets/not_a_tool", { enabled: false })).status).toBe(404);
    expect((await h.post("/api/tools/toolsets/web_fetch", {})).status).toBe(400);
  });
});
