import { describe, it, expect, afterEach } from "vitest";
import { mkdir, mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RoadmapDependencyError, RoadmapParkedReviveError, RoadmapProofGateError, moveRoadmapItem } from "./move.js";
import { appendChannelProof } from "../gateway/channel-proof.js";
import { writeGatewayReceipt } from "../exec/modal-gateway-state.js";

const FIXTURE = {
  updated: "2026-01-01",
  items: [
    {
      id: "ND2",
      track: "Executive Function",
      title: "clarify tool",
      status: "next",
      size: "S",
      summary: "A summary.",
      done: "Done when asked.",
    },
    {
      id: "KANBAN",
      track: "Core UX",
      title: "Live roadmap kanban",
      status: "next",
      size: "M",
      summary: "Kanban.",
      done: "Move works.",
    },
  ],
};

let dir: string;

async function makeRoadmap(data: unknown = FIXTURE): Promise<string> {
  dir = await mkdtemp(join(tmpdir(), "vanta-move-"));
  await writeFile(join(dir, "roadmap.json"), JSON.stringify(data, null, 2), "utf8");
  return dir;
}

afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

describe("moveRoadmapItem", () => {
  it("updates the item status and returns the updated item", async () => {
    const root = await makeRoadmap();
    const item = await moveRoadmapItem(root, "ND2", "building");
    expect(item.id).toBe("ND2");
    expect(item.status).toBe("building");
  });

  it("persists the new status to roadmap.json", async () => {
    const root = await makeRoadmap();
    await moveRoadmapItem(root, "ND2", "shipped");
    const raw = await readFile(join(root, "roadmap.json"), "utf8");
    const data = JSON.parse(raw);
    const nd2 = data.items.find((i: { id: string }) => i.id === "ND2");
    expect(nd2.status).toBe("shipped");
  });

  it("adds a review parkedReason when moving a card to parked", async () => {
    const root = await makeRoadmap();
    const item = await moveRoadmapItem(root, "ND2", "parked");
    const raw = await readFile(join(root, "roadmap.json"), "utf8");
    const data = JSON.parse(raw);
    const nd2 = data.items.find((i: { id: string }) => i.id === "ND2");
    expect(item.parkedReason).toBe("review");
    expect(nd2.parkedReason).toBe("review");
  });

  it("removes parkedReason when moving a card out of parked", async () => {
    const root = await makeRoadmap({
      updated: "2026-01-01",
      items: [{ ...FIXTURE.items[0], status: "parked", parkedReason: "review" }],
    });
    const item = await moveRoadmapItem(root, "ND2", "next", { force: true });
    const raw = await readFile(join(root, "roadmap.json"), "utf8");
    const data = JSON.parse(raw);
    const nd2 = data.items.find((i: { id: string }) => i.id === "ND2");
    expect(item.parkedReason).toBeUndefined();
    expect(nd2.parkedReason).toBeUndefined();
  });

  it("blocks moving a parked card back into active work without force", async () => {
    const root = await makeRoadmap({
      updated: "2026-01-01",
      items: [{ ...FIXTURE.items[0], status: "parked", parkedReason: "external proof" }],
    });
    await expect(moveRoadmapItem(root, "ND2", "building")).rejects.toThrow(RoadmapParkedReviveError);
    await expect(moveRoadmapItem(root, "ND2", "building")).rejects.toThrow("vanta roadmap unblock ND2");
  });

  it("force overrides parked revive review", async () => {
    const root = await makeRoadmap({
      updated: "2026-01-01",
      items: [{ ...FIXTURE.items[0], status: "parked", parkedReason: "strategy decision" }],
    });
    const item = await moveRoadmapItem(root, "ND2", "building", { force: true });
    expect(item.status).toBe("building");
    expect(item.parkedReason).toBeUndefined();
  });

  it("does not let force move a parked strategy card directly to shipped", async () => {
    const root = await makeRoadmap({
      updated: "2026-01-01",
      items: [{ ...FIXTURE.items[0], id: "STRATEGY-CARD", status: "parked", parkedReason: "strategy decision" }],
    });
    await expect(moveRoadmapItem(root, "STRATEGY-CARD", "shipped", { force: true })).rejects.toThrow(RoadmapParkedReviveError);
    await expect(moveRoadmapItem(root, "STRATEGY-CARD", "shipped", { force: true })).rejects.toThrow("strategy decision");
  });

  it("does not let force ship a revived Run Anywhere proof card without its receipt", async () => {
    const root = await makeRoadmap({
      updated: "2026-01-01",
      items: [{ ...FIXTURE.items[0], id: "BACKEND-SERVERLESS-LIVE", status: "building" }],
    });
    await expect(moveRoadmapItem(root, "BACKEND-SERVERLESS-LIVE", "shipped", { force: true })).rejects.toThrow(RoadmapProofGateError);
    await expect(moveRoadmapItem(root, "BACKEND-SERVERLESS-LIVE", "shipped", { force: true })).rejects.toThrow(".vanta/serverless-gateway.json");
  });

  it("allows shipping a Run Anywhere proof card after its receipt exists", async () => {
    const root = await makeRoadmap({
      updated: "2026-01-01",
      items: [{ ...FIXTURE.items[0], id: "BACKEND-SERVERLESS-LIVE", status: "building" }],
    });
    await writeGatewayReceipt(root, {
      app: "vanta-gateway",
      volume: "vanta-gateway-data",
      provedAt: "2026-07-10T12:00:00.000Z",
      telegramAcceptedAt: "2026-07-10T12:00:01.000Z",
    });
    const item = await moveRoadmapItem(root, "BACKEND-SERVERLESS-LIVE", "shipped", { force: true });
    expect(item.status).toBe("shipped");
  });

  it("requires all Run Anywhere receipts before shipping the aggregate gate", async () => {
    const root = await makeRoadmap({
      updated: "2026-01-01",
      items: [{ ...FIXTURE.items[0], id: "RUN-ANYWHERE-V1-RELEASE-GATE", status: "building" }],
    });
    await writeGatewayReceipt(root, {
      app: "vanta-gateway",
      volume: "vanta-gateway-data",
      provedAt: "2026-07-10T12:00:00.000Z",
      telegramAcceptedAt: "2026-07-10T12:00:01.000Z",
    });
    await appendChannelProof(join(root, ".vanta"), {
      kind: "channel-round-trip",
      platform: "teams",
      transport: "bot-connector",
      conversationHash: "hash",
      parts: 1,
      acceptedAt: "2026-07-10T12:03:00.000Z",
    });
    await expect(moveRoadmapItem(root, "RUN-ANYWHERE-V1-RELEASE-GATE", "shipped", { force: true })).rejects.toThrow("RUN-ANYWHERE-TERMUX");
    await mkdir(join(root, ".vanta"), { recursive: true });
    await writeFile(join(root, ".vanta", "termux-arm64-proof.txt"), "TERMUX_ARM64_E2E_OK release_kernel=1 abi=arm64-v8a\n");
    const item = await moveRoadmapItem(root, "RUN-ANYWHERE-V1-RELEASE-GATE", "shipped", { force: true });
    expect(item.status).toBe("shipped");
  });

  it("updates the top-level updated field to today", async () => {
    const root = await makeRoadmap();
    await moveRoadmapItem(root, "ND2", "next");
    const raw = await readFile(join(root, "roadmap.json"), "utf8");
    const data = JSON.parse(raw);
    expect(data.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(data.updated).toBe(new Date().toISOString().slice(0, 10));
  });

  it("regenerates roadmap.html", async () => {
    const root = await makeRoadmap();
    await moveRoadmapItem(root, "KANBAN", "building");
    const { access } = await import("node:fs/promises");
    await expect(access(join(root, "roadmap.html"))).resolves.toBeUndefined();
  });

  it("throws when the id does not exist", async () => {
    const root = await makeRoadmap();
    await expect(moveRoadmapItem(root, "NOPE", "next")).rejects.toThrow(
      "no item with id 'NOPE'",
    );
  });

  it("does not mutate other items", async () => {
    const root = await makeRoadmap();
    await moveRoadmapItem(root, "ND2", "shipped");
    const raw = await readFile(join(root, "roadmap.json"), "utf8");
    const data = JSON.parse(raw);
    const kanban = data.items.find((i: { id: string }) => i.id === "KANBAN");
    expect(kanban.status).toBe("next");
  });

  it("preserves each item's existing key order to avoid unrelated diff churn", async () => {
    const original = { updated: "2026-01-01", items: [{ ...FIXTURE.items[0], source: "audit", updated: "2026-01-01", notes: "proof" }, { ...FIXTURE.items[1], notes: "proof", source: "audit" }] };
    const root = await makeRoadmap(original);
    await moveRoadmapItem(root, "ND2", "building");
    const raw = await readFile(join(root, "roadmap.json"), "utf8");
    const written = JSON.parse(raw) as typeof original;
    expect(written.items.map(Object.keys)).toEqual(original.items.map(Object.keys));
  });

  it("blocks moving to building while after dependencies are open", async () => {
    const root = await makeRoadmap({
      updated: "2026-01-01",
      items: [
        { ...FIXTURE.items[0], id: "FOUNDATION", status: "next" },
        { ...FIXTURE.items[1], id: "LAUNCH", status: "next", after: ["FOUNDATION"] },
      ],
    });

    await expect(moveRoadmapItem(root, "LAUNCH", "building")).rejects.toThrow(RoadmapDependencyError);
    await expect(moveRoadmapItem(root, "LAUNCH", "building")).rejects.toThrow("FOUNDATION (next)");
  });

  it("allows moving to building after dependencies ship", async () => {
    const root = await makeRoadmap({
      updated: "2026-01-01",
      items: [
        { ...FIXTURE.items[0], id: "FOUNDATION", status: "shipped" },
        { ...FIXTURE.items[1], id: "LAUNCH", status: "next", after: ["FOUNDATION"] },
      ],
    });

    const item = await moveRoadmapItem(root, "LAUNCH", "building");
    expect(item.status).toBe("building");
  });

  it("force overrides open dependency blocks", async () => {
    const root = await makeRoadmap({
      updated: "2026-01-01",
      items: [
        { ...FIXTURE.items[0], id: "FOUNDATION", status: "next" },
        { ...FIXTURE.items[1], id: "LAUNCH", status: "next", after: ["FOUNDATION"] },
      ],
    });

    const item = await moveRoadmapItem(root, "LAUNCH", "building", { force: true });
    expect(item.status).toBe("building");
  });
});
