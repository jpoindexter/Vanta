import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { RuntimeDetail, RuntimeStrip } from "./runtime-strip.js";
import type { DesktopRuntime, RuntimeHostSnapshot } from "./types.js";

const local: RuntimeHostSnapshot = {
  host: { id: "local", label: "Local Mac", kind: "local" },
  status: "running", transport: "reachable", kernel: "ready",
  engine: { id: "llama_cpp", lifecycle: "running", model: "qwen.gguf" },
  resources: { memoryUsedBytes: 12, memoryTotalBytes: 32, utilizationPercent: 37.5, throughputPerSecond: 10 },
  queueDepth: 2, observedAt: "2026-07-17T12:00:00.000Z", stale: false,
};
const remote: RuntimeHostSnapshot = {
  ...local,
  host: { id: "remote", label: "Remote GPU", kind: "remote" },
  status: "degraded", kernel: "not_ready", engine: { id: "vllm", lifecycle: "idle", model: "qwen-remote" },
};
const runtime: DesktopRuntime = { selectedHostId: "local", hosts: [local, remote] };

describe("RuntimeStrip", () => {
  it("keeps the active runtime legible in one compact control", () => {
    const html = renderToStaticMarkup(<RuntimeStrip runtime={runtime} onSelect={vi.fn(async () => undefined)} />);
    expect(html).toContain("Local Mac");
    expect(html).toContain("qwen.gguf");
    expect(html).toContain("llama_cpp");
    expect(html).toContain("Memory pressure 38%");
    expect(html).toContain("10.0 tok/s");
    expect(html).toContain("gated");
    expect(html).toContain('aria-expanded="false"');
  });

  it("exposes transport and kernel separately with accessible host switching", () => {
    const html = renderToStaticMarkup(<RuntimeDetail runtime={runtime} selected={remote} onSelect={vi.fn()} onClose={vi.fn()} />);
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-label="Runtime details"');
    expect(html).toContain("Transport");
    expect(html).toContain("Reachable");
    expect(html).toContain("Kernel boundary");
    expect(html).toContain("Not ready");
    expect(html).toContain("Switch runtime host");
    expect(html).toContain('aria-pressed="true"');
  });
});
