import { describe, expect, it, vi } from "vitest";
import { reconnectProviderAndResume } from "./provider-auth-recovery.js";

describe("provider authentication recovery", () => {
  it("resumes the saved request only after setup validation succeeds", async () => {
    const order: string[] = [];
    const save = vi.fn(async () => { order.push("verified"); });
    const retry = vi.fn(async () => { order.push("resumed"); });

    await reconnectProviderAndResume(save, retry, { provider: "codex", model: "gpt-5.6-sol", apiKey: "", resume: true });

    expect(order).toEqual(["verified", "resumed"]);
  });

  it("does not resume when setup validation fails", async () => {
    const save = vi.fn(async () => { throw new Error("Provider authentication required"); });
    const retry = vi.fn();

    await expect(reconnectProviderAndResume(save, retry, { provider: "openai", model: "gpt-5.6-sol", apiKey: "invalid", resume: true })).rejects.toThrow("Provider authentication required");
    expect(retry).not.toHaveBeenCalled();
  });
});
