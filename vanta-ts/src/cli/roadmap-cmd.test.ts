import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runRoadmapCommand } from "./roadmap-cmd.js";
import { writeGatewayReceipt } from "../exec/modal-gateway-state.js";

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
      { id: "STRATEGY-CARD", track: "Cofounder", title: "Company", status: "horizon", size: "L", summary: "", done: "" },
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

async function completeWorkspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "vanta-roadmap-cmd-"));
  roots.push(root);
  await writeFile(join(root, "roadmap.json"), JSON.stringify({
    updated: "2026-07-10",
    items: [
      { id: "DONE", track: "Harness", title: "Done", status: "shipped", size: "S", summary: "", done: "" },
      { id: "DECLINED", track: "Harness", title: "Declined", status: "parked", size: "S", summary: "", done: "", parkedReason: "declined/n-a" },
      { id: "DUPE", track: "Harness", title: "Duplicate", status: "parked", size: "S", summary: "", done: "", parkedReason: "duplicate" },
    ],
  }, null, 2), "utf8");
  return root;
}

async function actionableWorkspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "vanta-roadmap-cmd-"));
  roots.push(root);
  await writeFile(join(root, "roadmap.json"), JSON.stringify({
    updated: "2026-07-10",
    items: [
      { id: "GATE", track: "Harness", title: "Gate", status: "parked", size: "S", summary: "", done: "", parkedReason: "external proof", after: ["PROOF"] },
      { id: "PROOF", track: "Harness", title: "Proof", status: "parked", size: "L", summary: "", done: "", parkedReason: "external proof" },
    ],
  }, null, 2), "utf8");
  return root;
}

async function parkedStrategyWorkspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "vanta-roadmap-cmd-"));
  roots.push(root);
  await writeFile(join(root, "roadmap.json"), JSON.stringify({
    updated: "2026-07-10",
    items: [
      { id: "STRATEGY-CARD", track: "Cofounder", title: "Company", status: "parked", size: "L", summary: "", done: "", parkedReason: "strategy decision" },
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
    expect(out).toContain("STRATEGY-CARD");
  });

  it("filters to requested card ids", async () => {
    const root = await workspace();
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((line = "") => lines.push(String(line)));
    await runRoadmapCommand(root, ["unblock", "STRATEGY-CARD"]);
    const out = lines.join("\n");
    expect(out).toContain("STRATEGY-CARD");
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

describe("runRoadmapCommand proof-status", () => {
  it("prints all external gates as json and exits nonzero while receipts are absent", async () => {
    const root = await workspace();
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((line = "") => lines.push(String(line)));
    const code = await runRoadmapCommand(root, ["proof-status", "--json"]);
    const report = JSON.parse(lines.join("\n")) as { ready: boolean; passed: number; total: number; gates: Array<{ roadmapCardId: string }> };
    expect(code).toBe(1);
    expect(report).toMatchObject({ ready: false, passed: 0, total: 10 });
    expect(report.gates.map((gate) => gate.roadmapCardId)).toContain("MERCURY-CROSS-PLATFORM-SERVICE");
  });
});

describe("runRoadmapCommand proof-accept", () => {
  it("refuses acceptance while the receipt is missing", async () => {
    const root = await workspace();
    const errors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((line = "") => errors.push(String(line)));
    const code = await runRoadmapCommand(root, ["proof-accept", "BACKEND-SERVERLESS-LIVE"]);
    expect(code).toBe(1);
    expect(errors.join("\n")).toContain("proof gate failed");
  });

  it("accepts a ready receipt and emits structured output", async () => {
    const root = await workspace();
    await writeGatewayReceipt(root, {
      app: "vanta-gateway",
      volume: "vanta-gateway-data",
      provedAt: "2026-07-13T12:00:00.000Z",
      telegramAcceptedAt: "2026-07-13T12:00:01.000Z",
    });
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((line = "") => lines.push(String(line)));
    const code = await runRoadmapCommand(root, ["proof-accept", "BACKEND-SERVERLESS-LIVE", "--json"]);
    const result = JSON.parse(lines.join("\n")) as { accepted: Array<{ id: string }>; pending: unknown[] };
    expect(code).toBe(0);
    expect(result.accepted.map((item) => item.id)).toEqual(["BACKEND-SERVERLESS-LIVE"]);
    expect(result.pending).toHaveLength(9);
  });

  it("requires either one card id or --all-ready", async () => {
    const root = await workspace();
    const errors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((line = "") => errors.push(String(line)));
    expect(await runRoadmapCommand(root, ["proof-accept"])).toBe(1);
    expect(errors.join("\n")).toContain("Usage: vanta roadmap proof-accept");
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

  it("fails --require-complete when parked work remains", async () => {
    const root = await drainedWorkspace();
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((line = "") => lines.push(String(line)));
    const code = await runRoadmapCommand(root, ["status", "--require-complete"]);
    const out = lines.join("\n");
    expect(code).toBe(1);
    expect(out).toContain("roadmap complete: no");
    expect(out).toContain("open: 1");
    expect(out).toContain("parked: 1");
  });

  it("passes --require-complete when every open card is shipped or terminally parked", async () => {
    const root = await completeWorkspace();
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((line = "") => lines.push(String(line)));
    const code = await runRoadmapCommand(root, ["status", "--require-complete"]);
    expect(code).toBe(0);
    const out = lines.join("\n");
    expect(out).toContain("roadmap complete: yes");
    expect(out).toContain("open: 0");
    expect(out).toContain("terminal parked: 2");
  });

  it("keeps --require-complete exit behavior with json output", async () => {
    const root = await drainedWorkspace();
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((line = "") => lines.push(String(line)));
    const code = await runRoadmapCommand(root, ["status", "--json", "--require-complete"]);
    const out = JSON.parse(lines.join("\n")) as { complete: boolean; activeDrained: boolean; nonShippedTotal: number; openTotal: number; terminalParkedTotal: number };
    expect(code).toBe(1);
    expect(out.complete).toBe(false);
    expect(out.activeDrained).toBe(true);
    expect(out.nonShippedTotal).toBe(1);
    expect(out.openTotal).toBe(1);
    expect(out.terminalParkedTotal).toBe(0);
  });

  it("prints only open work with --open", async () => {
    const root = await completeWorkspace();
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((line = "") => lines.push(String(line)));
    const code = await runRoadmapCommand(root, ["status", "--open"]);
    expect(code).toBe(0);
    expect(lines.join("\n")).toBe("No open roadmap work remains.");
  });

  it("prints open work as json with --open --json", async () => {
    const root = await drainedWorkspace();
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((line = "") => lines.push(String(line)));
    const code = await runRoadmapCommand(root, ["status", "--open", "--json"]);
    const out = JSON.parse(lines.join("\n")) as Array<{ id: string; parkedReason?: string; actionable: boolean; blockedByOpenIds: string[] }>;
    expect(code).toBe(1);
    expect(out).toEqual([{ id: "PROOF", title: "Proof", status: "parked", parkedReason: "external proof", blockedByOpenIds: [], actionable: true }]);
  });

  it("filters open work to actionable cards", async () => {
    const root = await actionableWorkspace();
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((line = "") => lines.push(String(line)));
    const code = await runRoadmapCommand(root, ["status", "--open", "--actionable", "--json"]);
    const out = JSON.parse(lines.join("\n")) as Array<{ id: string; actionable: boolean }>;
    expect(code).toBe(1);
    expect(out).toEqual([{ id: "PROOF", title: "Proof", status: "parked", parkedReason: "external proof", blockedByOpenIds: [], actionable: true }]);
  });
});

describe("runRoadmapCommand move", () => {
  it("refuses to revive a parked card without force", async () => {
    const root = await workspace();
    const errors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((line = "") => errors.push(String(line)));
    const code = await runRoadmapCommand(root, ["move", "BACKEND-SERVERLESS-LIVE", "building"]);
    expect(code).toBe(1);
    expect(errors.join("\n")).toContain("requires review before revival");
    expect(errors.join("\n")).toContain("external proof");
  });

  it("allows an explicit force revive", async () => {
    const root = await workspace();
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((line = "") => lines.push(String(line)));
    const code = await runRoadmapCommand(root, ["move", "BACKEND-SERVERLESS-LIVE", "building", "--force"]);
    expect(code).toBe(0);
    expect(lines.join("\n")).toContain("Moved BACKEND-SERVERLESS-LIVE");
  });

  it("does not let force ship a proof-gated parked card", async () => {
    const root = await workspace();
    const errors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((line = "") => errors.push(String(line)));
    const code = await runRoadmapCommand(root, ["move", "BACKEND-SERVERLESS-LIVE", "shipped", "--force"]);
    expect(code).toBe(1);
    expect(errors.join("\n")).toContain("requires review before revival");
    expect(errors.join("\n")).toContain("external proof");
  });

  it("does not let force ship a parked strategy card directly", async () => {
    const root = await parkedStrategyWorkspace();
    const errors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((line = "") => errors.push(String(line)));
    const code = await runRoadmapCommand(root, ["move", "STRATEGY-CARD", "shipped", "--force"]);
    expect(code).toBe(1);
    expect(errors.join("\n")).toContain("requires review before revival");
    expect(errors.join("\n")).toContain("strategy decision");
  });
});
