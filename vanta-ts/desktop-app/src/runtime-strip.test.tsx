import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { RuntimeDetail, RuntimeStrip, RuntimeSummary } from "./runtime-strip.js";
import type { DesktopRuntime, RuntimeHostSnapshot } from "./types.js";

const local: RuntimeHostSnapshot = {
  host: { id: "local", label: "Local Mac", kind: "local" },
  status: "running", transport: "reachable", kernel: "ready",
  engine: { id: "llama_cpp", lifecycle: "running", model: "qwen.gguf" },
  resources: { memoryUsedBytes: 12, memoryTotalBytes: 32, utilizationPercent: 37.5, throughputPerSecond: 10 },
  queueDepth: 2, observedAt: "2026-07-17T12:00:00.000Z", stale: false,
  detail: {
    controllerId: "local-runtime", requestOwner: "session:fixture", approval: "approved",
    command: { executable: "llama-server", args: ["--model", "/models/qwen.gguf"], hash: "a".repeat(64) },
    resourceFit: { estimatedMemoryBytes: 12, availableMemoryBytes: 32, headroomBytes: 20, fits: true },
    benchmark: { latencyMs: 200, outputTokens: 5, providerLatencyMs: 120 },
    logs: [{ at: "2026-07-17T12:00:00.000Z", transition: "running" }], actions: ["stop", "reconnect"],
  },
};
const remote: RuntimeHostSnapshot = {
  ...local,
  host: { id: "remote", label: "Remote GPU", kind: "remote" },
  status: "degraded", kernel: "not_ready", engine: { id: "vllm", lifecycle: "idle", model: "qwen-remote" },
};
const runtime: DesktopRuntime = { selectedHostId: "local", hosts: [local, remote], usage: { calls: 1, inputTokens: 20, outputTokens: 5, activeDurationMs: 1_000, requestLatencyMs: 500, failures: 0, missingTelemetryCalls: 1 } };

describe("RuntimeStrip", () => {
  it("keeps task status visible while moving telemetry behind one disclosure", () => {
    const html = renderToStaticMarkup(<RuntimeStrip runtime={runtime} agentModel="gpt-5.6-sol" agentProvider="openai" phase="ready" onSelect={vi.fn(async () => undefined)} onAction={vi.fn(async () => undefined)} />);
    expect(html).toContain("Task system");
    expect(html).toContain("Ready");
    expect(html).toContain("Model and safety boundary are available.");
    expect(html).toContain("Runtime details");
    expect(html).not.toContain("gpt-5.6-sol");
    expect(html).not.toContain("qwen.gguf");
    expect(html).not.toContain("llama_cpp");
    expect(html).not.toContain("Memory pressure");
    expect(html).toContain('aria-expanded="false"');
  });

  it("exposes transport and kernel separately with accessible host switching", () => {
    const html = renderToStaticMarkup(<RuntimeDetail runtime={runtime} selected={remote} agentModel="gpt-5.6-sol" agentProvider="openai" agentRoute={{ provider: "openai", model: "gpt-5.6-sol", baseRoute: "https://api.openai.com/v1", billingMode: "metered", authMethod: "api_key", authState: "required" }} phase="ready" onSelect={vi.fn()} onAction={vi.fn()} onClose={vi.fn()} />);
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-label="Runtime details"');
    expect(html).toContain("Transport");
    expect(html).toContain("Reachable");
    expect(html).toContain("Kernel boundary");
    expect(html).toContain("Not ready");
    expect(html).toContain("Switch runtime host");
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("Launch command");
    expect(html).toContain("llama-server");
    expect(html).toContain("Resource fit");
    expect(html).toContain("Benchmark");
    expect(html).toContain("Runtime lifecycle actions");
    expect(html).toContain("Recent lifecycle");
    expect(html).toContain("Recorded usage");
    expect(html).toContain("1 call");
    expect(html).toContain("20 in / 5 out");
    expect(html).toContain("1 call incomplete");
    expect(html).toContain("Agent model");
    expect(html).toContain("Local runtime model");
    expect(html).toContain("Agent authentication");
    expect(html).toContain("API key · Required");
    expect(html).toContain("Agent route");
    expect(html).toContain("https://api.openai.com/v1");
  });

  it.each([
    {
      state: "remote-only",
      phase: "ready" as const,
      agentModel: "gpt-5.6-sol",
      agentProvider: "openai",
      runtime: { ...local, status: "idle" as const, engine: { lifecycle: "idle" as const } },
      expected: ["Task system", "Ready", "Runtime details"],
    },
    {
      state: "local-only",
      phase: "ready" as const,
      agentModel: "qwen.gguf",
      agentProvider: "ollama",
      runtime: local,
      expected: ["Task system", "Ready", "Runtime details"],
    },
    {
      state: "mixed",
      phase: "ready" as const,
      agentModel: "gpt-5.6-sol",
      agentProvider: "openai",
      runtime: local,
      expected: ["Task system", "Ready", "Runtime details"],
    },
    {
      state: "loading",
      phase: "loading" as const,
      agentModel: undefined,
      agentProvider: undefined,
      runtime: undefined,
      expected: ["Task system", "Checking", "Connecting to the selected model."],
    },
    {
      state: "unavailable",
      phase: "error" as const,
      agentModel: undefined,
      agentProvider: undefined,
      runtime: undefined,
      expected: ["Task system", "Model needed", "repair the model connection"],
    },
  ])("summarizes the task-facing $state state", ({ phase, agentModel, agentProvider, runtime: snapshot, expected }) => {
    const html = renderToStaticMarkup(<RuntimeSummary runtime={snapshot} agentModel={agentModel} agentProvider={agentProvider} phase={phase} />);
    for (const value of expected) expect(html).toContain(value);
  });

  it.each([
    [{ ...local, stale: true }, "Status may be stale", "refresh runtime evidence"],
    [remote, "Needs attention", "before starting consequential work"],
  ] as const)("names recovery for non-ready runtime evidence", (snapshot, label, guidance) => {
    const html = renderToStaticMarkup(<RuntimeSummary runtime={snapshot} agentModel="gpt-5.6-sol" agentProvider="openai" phase="ready" />);
    expect(html).toContain(label);
    expect(html).toContain(guidance);
  });
});
