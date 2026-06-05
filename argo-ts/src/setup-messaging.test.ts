import { describe, it, expect } from "vitest";
import { messagingPlatformById } from "./gateway/platforms/registry.js";
import {
  buildMessagingEnv,
  renderMessagingMenu,
  renderSetupSteps,
} from "./setup-messaging.js";

describe("buildMessagingEnv", () => {
  it("writes the secret env for telegram", () => {
    const tg = messagingPlatformById("telegram")!;
    expect(buildMessagingEnv(tg, "123:abc")).toEqual({ ARGO_TELEGRAM_TOKEN: "123:abc" });
  });

  it("writes the enable flag (no secret) for whatsapp", () => {
    const wa = messagingPlatformById("whatsapp")!;
    expect(buildMessagingEnv(wa)).toEqual({ ARGO_WHATSAPP_ENABLE: "1" });
  });

  it("omits the secret key when no secret is given", () => {
    const tg = messagingPlatformById("telegram")!;
    expect(buildMessagingEnv(tg)).toEqual({});
  });
});

describe("renderMessagingMenu", () => {
  it("tags telegram configured when its token is present, available when not", () => {
    expect(renderMessagingMenu({ ARGO_TELEGRAM_TOKEN: "x" })).toMatch(/Telegram\s+\[configured\]/);
    expect(renderMessagingMenu({})).toMatch(/Telegram\s+\[available\]/);
  });

  it("tags unimplemented platforms as planned", () => {
    const menu = renderMessagingMenu({});
    expect(menu).toMatch(/WhatsApp.*\[planned\]/);
    expect(menu).toMatch(/iMessage.*\[planned\]/);
  });
});

describe("renderSetupSteps", () => {
  it("includes the warning + prerequisite for whatsapp", () => {
    const out = renderSetupSteps(messagingPlatformById("whatsapp")!);
    expect(out).toMatch(/⚠/);
    expect(out).toMatch(/prerequisite:/);
    expect(out).toMatch(/QR/i);
  });

  it("numbers the telegram steps and shows the BotFather link", () => {
    const out = renderSetupSteps(messagingPlatformById("telegram")!);
    expect(out).toMatch(/1\. Open @BotFather/);
    expect(out).toMatch(/t\.me\/BotFather/);
  });
});
