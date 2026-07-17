import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { gatewayNodeArgs, startDesktopGateway } from "./gateway-control.js";

function child(exitCode: number | null = null): ChildProcess {
  return Object.assign(new EventEmitter(), { exitCode, unref: vi.fn() }) as unknown as ChildProcess;
}

describe("startDesktopGateway", () => {
  it("resolves package loader imports before changing to the project cwd", () => {
    const args = gatewayNodeArgs(["--import", "tsx"], "/app/src/cli.ts");
    expect(args[0]).toBe("--import");
    expect(args[1]).toMatch(/^file:/);
    expect(args.slice(-2)).toEqual(["/app/src/cli.ts", "gateway"]);
  });

  it("does not launch a second live gateway", async () => {
    const launch = vi.fn(() => child());
    const result = await startDesktopGateway("/tmp/project", {
      now: () => 2_000,
      read: async () => ({ version: 1, updatedAt: new Date(1_900).toISOString(), channels: [{ id: "telegram", status: "up" }] }),
      launch,
    });
    expect(result.state).toBe("live");
    expect(launch).not.toHaveBeenCalled();
  });

  it("reports a newly ready Telegram channel", async () => {
    let reads = 0;
    const result = await startDesktopGateway("/tmp/project", {
      now: () => 10_000,
      read: async () => (++reads < 3 ? null : { version: 1, updatedAt: new Date(10_000).toISOString(), channels: [{ id: "telegram", status: "up" }] }),
      launch: () => child(),
      wait: async () => undefined,
    });
    expect(result).toEqual({ state: "live", message: "Gateway is live with 1 channel." });
  });

  it("reports an early gateway exit", async () => {
    const result = await startDesktopGateway("/tmp/project", {
      now: () => 10_000,
      read: async () => null,
      launch: () => child(1),
      wait: async () => undefined,
    });
    expect(result.state).toBe("failed");
    expect(result.message).toContain("gateway-desktop.log");
  });
});
