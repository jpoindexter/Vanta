import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listSkills } from "../skills/store.js";
import { answerApproval, startControlHarness, type ControlHarness } from "./__fixtures__/control-harness.js";

const SKILL = "---\nname: hub-helper\ndescription: Helps with hub things\ncreated: 2026-10-15T00:00:00Z\nupdated: 2026-10-15T00:00:00Z\ntags: []\n---\nDo the hub thing.\n";

let h: ControlHarness;
let host: Server;
let skillUrl: string;

beforeEach(async () => {
  h = await startControlHarness();
  host = createServer((_req, res) => { res.setHeader("content-type", "text/plain"); res.end(SKILL); });
  await new Promise<void>((resolve) => host.listen(0, "127.0.0.1", resolve));
  skillUrl = `http://127.0.0.1:${(host.address() as AddressInfo).port}/SKILL.md`;
});
afterEach(async () => { await new Promise((resolve) => host.close(resolve)); await h.stop(); });

describe("skills hub search and preview", () => {
  it("finds a skill from a source and returns the fields the Skills tab shows", async () => {
    const { body } = await h.post("/api/skills/hub-search", { query: skillUrl, source: "url" });
    expect(body.results).toEqual([expect.objectContaining({ identifier: `url:${skillUrl}`, name: "hub-helper", source: "url" })]);
    expect(body.failures).toEqual([]);
  });

  it("reports a failing source as a failure row instead of an error", async () => {
    const { status, body } = await h.post("/api/skills/hub-search", { query: "http://127.0.0.1:1/none.md", source: "url" });
    expect(status).toBe(200);
    expect(body.results).toEqual([]);
    expect(body.failures).toEqual([expect.objectContaining({ source: "url" })]);
  });

  it("previews the full SKILL.md, files and risks without installing", async () => {
    const { body } = await h.post("/api/skills/hub-preview", { identifier: `url:${skillUrl}` });
    expect(body).toMatchObject({ name: "hub-helper", integrityOk: true, risks: [] });
    expect(body.skillMd).toContain("Do the hub thing.");
    expect(await listSkills(process.env)).toEqual([]);
  });

  it("refuses a malformed identifier", async () => {
    expect((await h.post("/api/skills/hub-preview", { identifier: "x" })).status).toBe(400);
  });
});

describe("skills hub install", () => {
  it("installs only after an approval that names the package, then the skill is active", async () => {
    const pending = h.post("/api/skills/hub-install", { identifier: `url:${skillUrl}` });
    const shown = await answerApproval(h, "allow");
    expect(shown).toMatchObject({ toolName: "skill_install" });
    expect(shown.action).toMatch(/install skill url:http:\/\/127\.0\.0\.1:\d+\/SKILL\.md \(1 file\(s\), sha256:[a-f0-9]{12}/);
    expect((await pending).body).toMatchObject({ ok: true, name: "hub-helper", status: "active" });
    expect((await listSkills(process.env)).map((skill) => skill.meta.name)).toContain("hub-helper");
  });

  it("installs nothing when approval is denied", async () => {
    const pending = h.post("/api/skills/hub-install", { identifier: `url:${skillUrl}` });
    await answerApproval(h, "deny");
    expect((await pending).status).toBe(403);
    expect(await listSkills(process.env)).toEqual([]);
  });
});
