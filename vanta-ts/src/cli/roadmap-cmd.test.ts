import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runRoadmapCommand } from "./roadmap-cmd.js";

const roots: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function workspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "vanta-roadmap-cmd-"));
  roots.push(root);
  await writeFile(join(root, "roadmap.json"), JSON.stringify({
    updated: "2026-07-10",
    items: [
      { id: "BACKEND-SERVERLESS-LIVE", track: "Harness", title: "Serverless", status: "parked", size: "L", summary: "", done: "", parkedReason: "external proof" },
      { id: "PCLIP-MULTI-COMPANY", track: "Cofounder", title: "Company", status: "horizon", size: "L", summary: "", done: "" },
    ],
  }, null, 2), "utf8");
  return root;
}

describe("runRoadmapCommand unblock", () => {
  it("prints concrete unblock steps", async () => {
    const root = await workspace();
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((line = "") => lines.push(String(line)));
    await runRoadmapCommand(root, ["unblock"]);
    const out = lines.join("\n");
    expect(out).toContain("BACKEND-SERVERLESS-LIVE");
    expect(out).toContain("vanta backend gateway deploy");
    expect(out).toContain("PCLIP-MULTI-COMPANY");
  });

  it("filters to requested card ids", async () => {
    const root = await workspace();
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((line = "") => lines.push(String(line)));
    await runRoadmapCommand(root, ["unblock", "PCLIP-MULTI-COMPANY"]);
    const out = lines.join("\n");
    expect(out).toContain("PCLIP-MULTI-COMPANY");
    expect(out).not.toContain("BACKEND-SERVERLESS-LIVE");
  });
});

describe("runRoadmapCommand status", () => {
  it("prints status counts and parked reason counts", async () => {
    const root = await workspace();
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((line = "") => lines.push(String(line)));
    await runRoadmapCommand(root, ["status"]);
    const out = lines.join("\n");
    expect(out).toContain("total: 2");
    expect(out).toContain("horizon: 1");
    expect(out).toContain("parked: 1");
    expect(out).toContain("parked reasons:");
    expect(out).toContain("- external proof: 1");
  });
});
