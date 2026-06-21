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
    expect(buildMessagingEnv(tg, "123:abc")).toEqual({ VANTA_TELEGRAM_TOKEN: "123:abc" });
  });

  it("writes the enable flag (no secret) for an enable-flag platform (imessage)", () => {
    const im = messagingPlatformById("imessage")!;
    expect(buildMessagingEnv(im)).toEqual({ VANTA_IMESSAGE_ENABLE: "1" });
  });

  it("omits the secret key when no secret is given", () => {
    const tg = messagingPlatformById("telegram")!;
    expect(buildMessagingEnv(tg)).toEqual({});
  });
});

describe("renderMessagingMenu", () => {
  it("tags telegram configured when its token is present, available when not", () => {
    expect(renderMessagingMenu({ VANTA_TELEGRAM_TOKEN: "x" })).toMatch(/Telegram\s+\[configured\]/);
    expect(renderMessagingMenu({})).toMatch(/Telegram\s+\[available\]/);
  });

  it("tags unimplemented platforms as planned", () => {
    const menu = renderMessagingMenu({});
    expect(menu).toMatch(/Teams.*\[planned\]/);
    // iMessage/Signal/WhatsApp are now implemented (available or configured, not planned)
    expect(menu).not.toMatch(/iMessage.*\[planned\]/);
    expect(menu).not.toMatch(/WhatsApp.*\[planned\]/);
  });
});

describe("renderSetupSteps", () => {
  it("includes the prerequisite + setup steps for whatsapp (Cloud API)", () => {
    const out = renderSetupSteps(messagingPlatformById("whatsapp")!);
    expect(out).toMatch(/prerequisite:/);
    expect(out).toMatch(/Cloud API/i);
  });

  it("numbers the telegram steps and shows the BotFather link", () => {
    const out = renderSetupSteps(messagingPlatformById("telegram")!);
    expect(out).toMatch(/1\. Open @BotFather/);
    expect(out).toMatch(/t\.me\/BotFather/);
  });
});
