import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { writeGatewayReceipt } from "../exec/modal-gateway-state.js";
import { appendChannelProof } from "../gateway/channel-proof.js";
import { RoadmapDependencyError, RoadmapProofGateError } from "./move.js";
import { acceptExternalProofs, ExternalProofCardError } from "./proof-accept.js";

const roots: string[] = [];

function card(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    track: "Proof",
    title: id,
    status: "parked",
    size: "S",
    summary: "External acceptance.",
    done: "Canonical receipt accepted.",
    parkedReason: "external proof",
    ...extra,
  };
}

async function workspace(items = [card("BACKEND-SERVERLESS-LIVE")]): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "vanta-proof-accept-"));
  roots.push(root);
  await writeFile(join(root, "roadmap.json"), JSON.stringify({ updated: "2026-07-13", items }, null, 2));
  return root;
}

async function readyServerless(root: string): Promise<void> {
  await writeGatewayReceipt(root, {
    app: "vanta-gateway",
    volume: "vanta-gateway-data",
    provedAt: "2026-07-13T12:00:00.000Z",
    telegramAcceptedAt: "2026-07-13T12:00:01.000Z",
  });
}

async function readyRunAnywhere(root: string): Promise<void> {
  await readyServerless(root);
  await appendChannelProof(join(root, ".vanta"), {
    kind: "channel-round-trip",
    platform: "teams",
    transport: "bot-connector",
    conversationHash: "conversation-hash",
    parts: 1,
    acceptedAt: "2026-07-13T12:01:00.000Z",
  });
  await mkdir(join(root, ".vanta"), { recursive: true });
  await writeFile(join(root, ".vanta", "termux-arm64-proof.txt"), "TERMUX_ARM64_E2E_OK release_kernel=1 abi=arm64-v8a\n");
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("acceptExternalProofs", () => {
  it("refuses a card while its canonical receipt is missing without changing the roadmap", async () => {
    const root = await workspace();
    const before = await readFile(join(root, "roadmap.json"), "utf8");
    await expect(acceptExternalProofs(root, ["BACKEND-SERVERLESS-LIVE"])).rejects.toThrow(RoadmapProofGateError);
    expect(await readFile(join(root, "roadmap.json"), "utf8")).toBe(before);
  });

  it("ships a ready parked card and records the accepted evidence", async () => {
    const root = await workspace();
    await readyServerless(root);
    const result = await acceptExternalProofs(root, ["BACKEND-SERVERLESS-LIVE"]);
    expect(result.accepted.map((item) => item.id)).toEqual(["BACKEND-SERVERLESS-LIVE"]);
    const roadmap = JSON.parse(await readFile(join(root, "roadmap.json"), "utf8"));
    expect(roadmap.items[0]).toMatchObject({ status: "shipped" });
    expect(roadmap.items[0].parkedReason).toBeUndefined();
    expect(roadmap.items[0].notes).toContain("EXTERNAL PROOF ACCEPTED");
    expect(roadmap.items[0].notes).toContain(".vanta/serverless-gateway.json");
  });

  it("refuses ids that are not canonical external-proof gates", async () => {
    const root = await workspace([card("NOT-A-GATE")]);
    await expect(acceptExternalProofs(root, ["NOT-A-GATE"])).rejects.toThrow(ExternalProofCardError);
  });

  it("requires aggregate dependencies to ship before direct acceptance", async () => {
    const root = await workspace([
      card("BACKEND-SERVERLESS-LIVE"),
      card("MSG-ADAPTER-TEAMS"),
      card("RUN-ANYWHERE-TERMUX"),
      card("RUN-ANYWHERE-V1-RELEASE-GATE", { after: ["BACKEND-SERVERLESS-LIVE", "MSG-ADAPTER-TEAMS", "RUN-ANYWHERE-TERMUX"] }),
    ]);
    await readyRunAnywhere(root);
    await expect(acceptExternalProofs(root, ["RUN-ANYWHERE-V1-RELEASE-GATE"])).rejects.toThrow(RoadmapDependencyError);
  });

  it("accepts ready children before their aggregate with --all-ready semantics", async () => {
    const root = await workspace([
      card("RUN-ANYWHERE-V1-RELEASE-GATE", { after: ["BACKEND-SERVERLESS-LIVE", "MSG-ADAPTER-TEAMS", "RUN-ANYWHERE-TERMUX"] }),
      card("RUN-ANYWHERE-TERMUX"),
      card("MSG-ADAPTER-TEAMS"),
      card("BACKEND-SERVERLESS-LIVE"),
    ]);
    await readyRunAnywhere(root);
    const result = await acceptExternalProofs(root, [], true);
    expect(result.accepted.map((item) => item.id)).toEqual([
      "BACKEND-SERVERLESS-LIVE",
      "MSG-ADAPTER-TEAMS",
      "RUN-ANYWHERE-TERMUX",
      "RUN-ANYWHERE-V1-RELEASE-GATE",
    ]);
    const roadmap = JSON.parse(await readFile(join(root, "roadmap.json"), "utf8"));
    expect(roadmap.items.every((item: { status: string }) => item.status === "shipped")).toBe(true);
  });
});
