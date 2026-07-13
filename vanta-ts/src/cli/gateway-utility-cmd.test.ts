import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { appendChannelProof, buildChannelProof } from "../gateway/channel-proof.js";
import { writeGatewayReadiness } from "../gateway/readiness-state.js";
import { runGatewayUtilityCommand } from "./gateway-utility-cmd.js";

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("gateway utility commands", () => {
  it("reports persisted gateway status without starting the daemon", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-gateway-status-"));
    roots.push(root);
    await writeGatewayReadiness(join(root, ".vanta"), [{ id: "telegram", status: "up", failures: 0 }], new Date());
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await expect(runGatewayUtilityCommand(root, ["status", "--json"])).resolves.toBe(true);
    const report = JSON.parse(String(log.mock.calls[0]?.[0])) as { state: string; channels: Array<{ id: string; status: string }> };
    expect(report.state).toBe("live");
    expect(report.channels).toEqual([{ id: "telegram", status: "up" }]);
  });

  it("prints persisted proofs filtered by platform", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-gateway-proof-"));
    roots.push(root);
    const proof = buildChannelProof(
      { chatId: "C1", id: "A1", text: "private" },
      { platform: "teams", transport: "bot-connector", accepted: true, parts: 1 },
    );
    await appendChannelProof(join(root, ".vanta"), proof);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await expect(runGatewayUtilityCommand(root, ["channel-proofs", "teams"])).resolves.toBe(true);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("teams/bot-connector"));
  });

  it("prints channel proofs as json when requested", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-gateway-proof-"));
    roots.push(root);
    await appendChannelProof(join(root, ".vanta"), {
      kind: "channel-round-trip",
      platform: "teams",
      transport: "bot-connector",
      conversationHash: "hash",
      parts: 1,
      acceptedAt: "2026-07-10T12:00:00.000Z",
    });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await expect(runGatewayUtilityCommand(root, ["channel-proofs", "teams", "--json"])).resolves.toBe(true);
    const proofs = JSON.parse(String(log.mock.calls[0]?.[0])) as Array<{ platform: string; transport: string }>;
    expect(proofs).toEqual([expect.objectContaining({ platform: "teams", transport: "bot-connector" })]);
  });

  it("prints an empty json list when no channel proofs match", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-gateway-proof-"));
    roots.push(root);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await expect(runGatewayUtilityCommand(root, ["channel-proofs", "teams", "--json"])).resolves.toBe(true);
    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toEqual([]);
  });

  it("returns false for daemon mode and unrelated subcommands", async () => {
    await expect(runGatewayUtilityCommand("/tmp", [])).resolves.toBe(false);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(runGatewayUtilityCommand("/tmp", ["unknown"])).resolves.toBe(true);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("usage: vanta gateway"));
  });

  it("keeps invalid verify-channel timeout handling finite", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(runGatewayUtilityCommand("/tmp", ["verify-channels", "--timeout-ms", "nope"]))
      .resolves.toBe(true);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("usage: vanta gateway verify-channels"));
  });
});
