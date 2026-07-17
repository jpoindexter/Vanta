import { describe, expect, it, vi } from "vitest";
import { createSetupCommand } from "./setup-cmd.js";
import type { ReplCtx } from "./types.js";

function ctx(env: NodeJS.ProcessEnv = {}): ReplCtx {
  return {
    setup: { provider: { modelId: () => "gpt-5.5" } },
    env,
    dataDir: "/tmp/vanta",
  } as unknown as ReplCtx;
}

describe("/setup", () => {
  it("shows a small setup hub instead of aliasing the model picker", async () => {
    const probe = vi.fn();
    const result = await createSetupCommand({ probe })("", ctx());
    expect(result.output).toContain("Model      gpt-5.5");
    expect(result.output).toContain("Telegram   needs setup");
    expect(result.output).toContain("/setup telegram");
    expect(probe).not.toHaveBeenCalled();
  });

  it("gives one exact Telegram setup command when unconfigured", async () => {
    const result = await createSetupCommand({ status: async () => ({ state: "unconfigured", title: "Telegram needs setup.", detail: "Add a BotFather token and an owner allowlist.", action: { id: "configure", label: "Open Telegram setup", command: "vanta setup messaging telegram" } }) })("messaging", ctx());
    expect(result.output).toContain("vanta setup messaging telegram");
    expect(result.output).not.toContain("read_file");
    expect(result.output).not.toContain("grep");
    expect(result.setupHandoff).toEqual({ section: "messaging", platformId: "telegram" });
  });

  it("supports status-only inspection without launching the wizard", async () => {
    const result = await createSetupCommand({ status: async () => ({ state: "stopped", title: "Telegram is configured but delivery is stopped.", detail: "Start the gateway.", action: { id: "start_gateway", label: "Start gateway", command: "vanta gateway" } }) })("telegram status", ctx());
    expect(result.output).toContain("delivery is stopped");
    expect(result.setupHandoff).toBeUndefined();
  });

  it("reports verified Telegram delivery and access state", async () => {
    const result = await createSetupCommand({ status: async () => ({ state: "webhook_live", title: "Telegram is live through webhook delivery.", detail: "Telegram bot vanta_bot responded", action: { id: "inspect_gateway", label: "View gateway status", command: "vanta gateway status" } }) })("telegram", ctx({
      VANTA_TELEGRAM_TOKEN: "secret",
      VANTA_TELEGRAM_ALLOW: "123456",
      VANTA_TELEGRAM_WEBHOOK_SECRET: "hook",
    }));
    expect(result.output).toContain("live through webhook delivery");
    expect(result.output).toContain("View gateway status: vanta gateway status");
  });

  it("preserves configured credentials when the live probe fails", async () => {
    const result = await createSetupCommand({ status: async () => ({ state: "needs_repair", title: "Telegram needs repair.", detail: "Telegram token rejected", action: { id: "configure", label: "Repair Telegram setup", command: "vanta setup messaging telegram" } }) })("messaging", ctx({ VANTA_TELEGRAM_TOKEN: "secret" }));
    expect(result.output).toContain("Telegram needs repair");
    expect(result.output).toContain("Repair Telegram setup: vanta setup messaging telegram");
  });
});
