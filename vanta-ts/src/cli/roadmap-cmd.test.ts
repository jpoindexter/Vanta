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

async function drainedWorkspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "vanta-roadmap-cmd-"));
  roots.push(root);
  await writeFile(join(root, "roadmap.json"), JSON.stringify({
    updated: "2026-07-10",
    items: [
      { id: "DONE", track: "Harness", title: "Done", status: "shipped", size: "S", summary: "", done: "" },
      { id: "PROOF", track: "Harness", title: "Proof", status: "parked", size: "L", summary: "", done: "", parkedReason: "external proof" },
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

  it("prints unblock plans as json when requested", async () => {
    const root = await workspace();
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((line = "") => lines.push(String(line)));
    await runRoadmapCommand(root, ["unblock", "BACKEND-SERVERLESS-LIVE", "--json"]);
    const plans = JSON.parse(lines.join("\n")) as Array<{ id: string; actions: string[] }>;
    expect(plans).toHaveLength(1);
    expect(plans[0]?.id).toBe("BACKEND-SERVERLESS-LIVE");
    expect(plans[0]?.actions.join("\n")).toContain("vanta backend gateway deploy");
  });
});

describe("runRoadmapCommand status", () => {
  it("prints status counts and parked reason counts", async () => {
    const root = await workspace();
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((line = "") => lines.push(String(line)));
    const code = await runRoadmapCommand(root, ["status"]);
    const out = lines.join("\n");
    expect(code).toBe(0);
    expect(out).toContain("total: 2");
    expect(out).toContain("horizon: 1");
    expect(out).toContain("parked: 1");
    expect(out).toContain("parked reasons:");
    expect(out).toContain("- external proof: 1");
  });

  it("prints status as json when requested", async () => {
    const root = await workspace();
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((line = "") => lines.push(String(line)));
    const code = await runRoadmapCommand(root, ["status", "--json"]);
    const out = JSON.parse(lines.join("\n")) as {
      total: number;
      activeTotal: number;
      activeDrained: boolean;
      statuses: Record<string, number>;
      parkedReasons: Record<string, number>;
    };
    expect(code).toBe(0);
    expect(out.total).toBe(2);
    expect(out.activeTotal).toBe(1);
    expect(out.activeDrained).toBe(false);
    expect(out.statuses.horizon).toBe(1);
    expect(out.parkedReasons["external proof"]).toBe(1);
  });

  it("passes --require-drained when only parked work remains", async () => {
    const root = await drainedWorkspace();
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((line = "") => lines.push(String(line)));
    const code = await runRoadmapCommand(root, ["status", "--require-drained"]);
    expect(code).toBe(0);
    expect(lines.join("\n")).toContain("active roadmap drained: yes");
  });

  it("fails --require-drained when active roadmap work remains", async () => {
    const root = await workspace();
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((line = "") => lines.push(String(line)));
    const code = await runRoadmapCommand(root, ["status", "--require-drained"]);
    const out = lines.join("\n");
    expect(code).toBe(1);
    expect(out).toContain("active roadmap drained: no");
    expect(out).toContain("horizon: 1");
  });

  it("keeps --require-drained exit behavior with json output", async () => {
    const root = await workspace();
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((line = "") => lines.push(String(line)));
    const code = await runRoadmapCommand(root, ["status", "--json", "--require-drained"]);
    const out = JSON.parse(lines.join("\n")) as { activeDrained: boolean; activeTotal: number };
    expect(code).toBe(1);
    expect(out.activeDrained).toBe(false);
    expect(out.activeTotal).toBe(1);
  });
});
