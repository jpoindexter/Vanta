import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { xiaohongshuChannel, xiaohongshuMcpReachable } from "./xiaohongshu.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("xiaohongshu reach channel", () => {
  it("matches Xiaohongshu and short-link URLs", () => {
    expect(xiaohongshuChannel.canHandle("https://www.xiaohongshu.com/explore/abc")).toBe(true);
    expect(xiaohongshuChannel.canHandle("https://xhslink.com/a/b")).toBe(true);
    expect(xiaohongshuChannel.canHandle("https://example.com/explore/abc")).toBe(false);
  });

  it("reports OpenCLI when the confirmed backend is installed", async () => {
    const dir = mkdtempSync(join(tmpdir(), "vanta-xhs-opencli-"));
    const bin = join(dir, "opencli");
    writeFileSync(bin, "#!/bin/sh\necho opencli 1.0\n");
    chmodSync(bin, 0o755);
    const status = await xiaohongshuChannel.check({ PATH: dir });
    expect(status).toMatchObject({ name: "xiaohongshu", status: "ok", activeBackend: "OpenCLI" });
  });

  it("surfaces MCP setup when the server is alive but mcporter is not configured", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 404 }));
    const status = await xiaohongshuChannel.check({ PATH: "/definitely-empty" });
    expect(status).toMatchObject({ status: "warn", activeBackend: "xiaohongshu-mcp" });
    expect(status.fix).toContain("mcporter config add xiaohongshu");
  });

  it("reports off when no backend is available", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("down"));
    const status = await xiaohongshuChannel.check({ PATH: "/definitely-empty" });
    expect(status).toMatchObject({ name: "xiaohongshu", status: "off", activeBackend: null });
    expect(status.fix).toContain("OpenCLI");
  });

  it("treats any MCP HTTP response as reachable", async () => {
    await expect(xiaohongshuMcpReachable(async () => new Response("", { status: 405 }))).resolves.toBe(true);
  });
});
