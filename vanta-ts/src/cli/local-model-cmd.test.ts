import { describe, expect, it, vi } from "vitest";
import { runLocalModelCommand } from "./local-model-cmd.js";

const hardware = { platform: "darwin", architecture: "arm64", memoryBytes: 16 * 1024 ** 3, freeDiskBytes: 20 * 1024 ** 3, runtimeAvailable: true, supported: true, reason: "ready" as const };
const launch = { runtimeId: "local", backend: "llama_cpp" as const, location: "local" as const, support: "supported" as const, command: "llama-server", args: ["--model", "/private/model.gguf"], endpoint: "http://127.0.0.1:8127", commandHash: "a".repeat(64), resource: { estimatedMemoryBytes: 1, availableMemoryBytes: 2, headroomBytes: 1, fits: true }, approvalAction: "launch local runtime" };

describe("local-model command", () => {
  it("prints one hardware/model/command preview and ends at a verified result", async () => {
    const logs: string[] = [];
    const createWizard = vi.fn((_input: unknown) => ({
      preview: async () => ({ hardware, model: {}, storageRequiredBytes: 600_000_000, launch }),
      run: async () => ({ checkpoint: { status: "done" }, model: { label: "Qwen fixture" }, runtime: { status: "running" }, response: "Do the smallest urgent task first." }),
    }));
    const code = await runLocalModelCommand("/tmp/project", ["setup", "--yes"], {
      log: (line) => logs.push(line), createWizard: createWizard as never,
      kernel: { assess: vi.fn(async () => ({ risk: "ask", needsHuman: true, reason: "network" })) } as never,
    });
    expect(code).toBe(0);
    expect(logs.join("\n")).toContain("Hardware: arm64");
    expect(logs.join("\n")).toContain("Launch preview: llama-server");
    expect(logs.join("\n")).toContain("Verified local result");
  });

  it("declines an ask-tier download before the wizard runs", async () => {
    const run = vi.fn();
    const code = await runLocalModelCommand("/tmp/project", ["setup"], {
      log: () => {}, confirm: async () => false,
      createWizard: (() => ({ preview: async () => ({ hardware, model: {}, storageRequiredBytes: 1, launch }), run })) as never,
      kernel: { assess: vi.fn(async () => ({ risk: "ask", needsHuman: true, reason: "network" })) } as never,
    });
    expect(code).toBe(1);
    expect(run).not.toHaveBeenCalled();
  });

  it("accepts a checksum-pinned custom model manifest", async () => {
    const createWizard = vi.fn((_input: unknown) => ({
      preview: async () => ({ hardware, model: {}, storageRequiredBytes: 2, launch }),
      run: async () => ({ checkpoint: { status: "done" }, model: { label: "Custom" }, runtime: { status: "running" }, response: "Custom model result." }),
    }));
    const code = await runLocalModelCommand("/tmp/project", [
      "setup", "--yes", "--model-id", "custom", "--model-label", "Custom",
      "--model-url", "https://models.test/custom.gguf", "--sha256", "b".repeat(64),
      "--bytes", "1024", "--filename", "custom.gguf", "--context", "4096",
    ], {
      log: () => {}, createWizard: createWizard as never,
      kernel: { assess: vi.fn(async () => ({ risk: "allow", needsHuman: false, reason: "pinned" })) } as never,
    });
    expect(code).toBe(0);
    expect(createWizard.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ model: expect.objectContaining({ id: "custom", bytes: 1024, contextTokens: 4096 }) }));
  });
});
