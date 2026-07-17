import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readGatewayReadiness, writeGatewayReadiness } from "./readiness-state.js";
import { readChannelHealth } from "./run.js";

const dirs: string[] = [];
afterEach(async () => Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))));

describe("gateway readiness snapshot", () => {
  it("reports a successful single adapter as an up channel", () => {
    const platform = { id: "telegram" } as Parameters<typeof readChannelHealth>[0];
    expect(readChannelHealth(platform)).toEqual([{ id: "telegram", status: "up", failures: 0 }]);
  });

  it("persists status only and drops raw errors", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vanta-gateway-ready-")); dirs.push(dir);
    await writeGatewayReadiness(dir, [{ id: "slack", status: "down", failures: 2, lastError: "secret transport failure" }], new Date(0));
    const snapshot = await readGatewayReadiness(dir);
    expect(snapshot).toEqual({ version: 1, updatedAt: new Date(0).toISOString(), channels: [{ id: "slack", status: "down" }] });
    expect(JSON.stringify(snapshot)).not.toContain("secret transport failure");
  });
});
