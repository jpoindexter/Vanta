import { describe, expect, it, vi } from "vitest";
import { createSetupCommand } from "./setup-cmd.js";
import type { ReplCtx } from "./types.js";

function ctx(env: NodeJS.ProcessEnv = {}): ReplCtx {
  return {
    setup: { provider: { modelId: () => "gpt-5.5" } },
    env,
  } as unknown as ReplCtx;
}

describe("/setup", () => {
  it("shows a small setup hub instead of aliasing the model picker", async () => {
    const probe = vi.fn();
    const result = await createSetupCommand({ probe })("", ctx());
    expect(result.output).toContain("Model      gpt-5.5");
    expect(result.output).toContain("Telegram   needs setup");
    expect(result.output).toContain("/setup messaging");
    expect(probe).not.toHaveBeenCalled();
  });

  it("gives one exact Telegram setup command when unconfigured", async () => {
    const result = await createSetupCommand()("messaging", ctx());
    expect(result.output).toContain("vanta setup messaging telegram");
    expect(result.output).not.toContain("read_file");
    expect(result.output).not.toContain("grep");
  });

  it("reports verified Telegram delivery and access state", async () => {
    const probe = vi.fn(async () => ({ ok: true, detail: "Telegram bot vanta_bot responded" }));
    const result = await createSetupCommand({ probe })("telegram", ctx({
      VANTA_TELEGRAM_TOKEN: "secret",
      VANTA_TELEGRAM_ALLOW: "123456",
      VANTA_TELEGRAM_WEBHOOK_SECRET: "hook",
    }));
    expect(result.output).toContain("Telegram ready");
    expect(result.output).toContain("owner allowlist on");
    expect(result.output).toContain("webhook wake configured");
  });

  it("preserves configured credentials when the live probe fails", async () => {
    const probe = vi.fn(async () => ({ ok: false, detail: "Telegram token rejected" }));
    const result = await createSetupCommand({ probe })("messaging", ctx({ VANTA_TELEGRAM_TOKEN: "secret" }));
    expect(result.output).toContain("configured but not usable");
    expect(result.output).toContain("existing configuration is preserved");
  });
});
