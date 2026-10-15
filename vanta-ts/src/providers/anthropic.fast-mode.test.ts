import { beforeEach, describe, expect, it, vi } from "vitest";
import { AnthropicProvider } from "./anthropic.js";

// Proves the fast-mode WIRE contract on the real provider: `speed: "fast"` in
// the create params AND `fast-mode-2026-02-01` in the anthropic-beta header,
// only when fast is requested on a supported Opus model.

const mockSdkCreate = vi.hoisted(() => vi.fn());
const constructorOpts = vi.hoisted(() => [] as Array<{ defaultHeaders?: Record<string, string> }>);

vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    constructor(opts: { defaultHeaders?: Record<string, string> }) { constructorOpts.push(opts); }
    messages = { create: mockSdkCreate };
  },
}));

type CreateParams = { speed?: string; model?: string };

function lastCall(): { params: CreateParams; betas: string } {
  return {
    params: (mockSdkCreate.mock.calls.at(-1)?.[0] ?? {}) as CreateParams,
    betas: constructorOpts.at(-1)?.defaultHeaders?.["anthropic-beta"] ?? "",
  };
}

async function complete(model: string, serviceTier?: "fast" | "standard"): Promise<void> {
  mockSdkCreate.mockResolvedValueOnce({ content: [{ type: "text", text: "ok" }], stop_reason: "end_turn" });
  const provider = new AnthropicProvider({ apiKey: "test-key", model });
  await provider.complete([{ role: "user", content: "hi" }], [], serviceTier ? { serviceTier } : undefined);
}

describe("AnthropicProvider fast mode", () => {
  beforeEach(() => {
    mockSdkCreate.mockReset();
    constructorOpts.length = 0;
  });

  it("sends speed:fast plus the fast-mode beta on a supported Opus model", async () => {
    await complete("claude-opus-5", "fast");
    const { params, betas } = lastCall();
    expect(params.speed).toBe("fast");
    expect(betas).toContain("fast-mode-2026-02-01");
  });

  it("sends neither for standard speed", async () => {
    await complete("claude-opus-5", "standard");
    const { params, betas } = lastCall();
    expect(params.speed).toBeUndefined();
    expect(betas).not.toContain("fast-mode");
  });

  it("does not send fast on a model Anthropic rejects it for", async () => {
    await complete("claude-opus-4-7", "fast");
    const { params, betas } = lastCall();
    expect(params.speed).toBeUndefined();
    expect(betas).not.toContain("fast-mode");
  });

  it("leaves an unconfigured request byte-identical to today's", async () => {
    await complete("claude-sonnet-5");
    const { params, betas } = lastCall();
    expect(params.speed).toBeUndefined();
    expect(betas).not.toContain("fast-mode");
  });
});
