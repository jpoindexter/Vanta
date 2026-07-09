import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { formatChannelVerifyReport, verifyMessagingChannels } from "./channel-verify.js";

const NOW = new Date("2026-07-09T17:00:00.000Z");

describe("verifyMessagingChannels", () => {
  it("logs every implemented adapter as not-configured when env is empty", async () => {
    const report = await verifyMessagingChannels({ env: {}, now: NOW, timeoutMs: 50 });
    expect(report.results.length).toBeGreaterThanOrEqual(20);
    expect(report.totals["not-configured"]).toBe(report.results.length);
    expect(report.results.find((r) => r.id === "teams")).toMatchObject({
      status: "not-configured",
      missingEnv: ["VANTA_TEAMS_APP_ID", "VANTA_TEAMS_APP_PASSWORD"],
    });
  });

  it("runs a live local probe for configured WebChat without external network", async () => {
    const report = await verifyMessagingChannels({
      env: { VANTA_WEBCHAT_ENABLE: "1" },
      now: NOW,
      timeoutMs: 50,
    });
    expect(report.results.find((r) => r.id === "webchat")).toMatchObject({
      status: "live",
      evidence: "connect/poll/disconnect completed; poll returned 0 message(s)",
    });
  });

  it("writes a JSON ledger when dataDir is supplied", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vanta-channel-verify-"));
    const report = await verifyMessagingChannels({
      env: { VANTA_WEBCHAT_ENABLE: "1" },
      dataDir: dir,
      now: NOW,
      timeoutMs: 50,
    });
    expect(report.ledgerPath).toBe(join(dir, "channel-verification", "2026-07-09T17-00-00-000Z.json"));
    const saved = JSON.parse(await readFile(report.ledgerPath!, "utf8")) as { decision: string };
    expect(saved.decision).toContain("Native mobile nodes");
  });
});

describe("formatChannelVerifyReport", () => {
  it("renders totals, per-channel rows, decision, and ledger path", async () => {
    const report = await verifyMessagingChannels({
      env: { VANTA_WEBCHAT_ENABLE: "1" },
      now: NOW,
      timeoutMs: 50,
    });
    const out = formatChannelVerifyReport({ ...report, ledgerPath: "/tmp/ledger.json" });
    expect(out).toContain("live 1");
    expect(out).toContain("webchat");
    expect(out).toContain("decision:");
    expect(out).toContain("ledger: /tmp/ledger.json");
  });
});
