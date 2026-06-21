import { describe, it, expect } from "vitest";
import {
  MESSAGING_CATALOG,
  messagingPlatformById,
  platformAvailability,
} from "./registry.js";

describe("messaging registry", () => {
  it("includes telegram, imessage, signal, ntfy, mattermost, irc as implemented platforms", () => {
    const implemented = MESSAGING_CATALOG.filter((p) => p.implemented).map((p) => p.id);
    expect(implemented).toContain("telegram");
    expect(implemented).toContain("imessage");
    expect(implemented).toContain("signal");
    expect(implemented).toContain("ntfy");
    expect(implemented).toContain("mattermost");
    expect(implemented).toContain("irc");
  });

  it("requires server, nick, and channel for irc", () => {
    const irc = messagingPlatformById("irc")!;
    expect(irc.implemented).toBe(true);
    expect(irc.requiredEnv).toEqual(["VANTA_IRC_SERVER", "VANTA_IRC_NICK", "VANTA_IRC_CHANNEL"]);
    const partial = { VANTA_IRC_SERVER: "irc.libera.chat:6667", VANTA_IRC_NICK: "vanta" };
    expect(platformAvailability(irc, partial).missing).toEqual(["VANTA_IRC_CHANNEL"]);
    expect(platformAvailability(irc, { ...partial, VANTA_IRC_CHANNEL: "#vanta" }).configured).toBe(true);
  });

  it("requires server url, token, and channel for mattermost", () => {
    const mm = messagingPlatformById("mattermost")!;
    expect(mm.implemented).toBe(true);
    expect(mm.requiredEnv).toEqual(["VANTA_MATTERMOST_URL", "VANTA_MATTERMOST_TOKEN", "VANTA_MATTERMOST_CHANNEL"]);
    expect(mm.secretEnv).toBe("VANTA_MATTERMOST_TOKEN");
    const partial = { VANTA_MATTERMOST_URL: "https://mm.example", VANTA_MATTERMOST_TOKEN: "tok" };
    expect(platformAvailability(mm, partial).missing).toEqual(["VANTA_MATTERMOST_CHANNEL"]);
    expect(platformAvailability(mm, { ...partial, VANTA_MATTERMOST_CHANNEL: "c1" }).configured).toBe(true);
  });

  it("every entry has required env + at least one setup step", () => {
    for (const p of MESSAGING_CATALOG) {
      expect(p.requiredEnv.length).toBeGreaterThan(0);
      expect(p.setupSteps.length).toBeGreaterThan(0);
    }
  });

  it("looks a platform up by id", () => {
    expect(messagingPlatformById("telegram")?.label).toBe("Telegram");
    expect(messagingPlatformById("nope")).toBeUndefined();
  });

  it("reports telegram configured only when the token env is set", () => {
    const tg = messagingPlatformById("telegram")!;
    expect(platformAvailability(tg, {}).configured).toBe(false);
    expect(platformAvailability(tg, {}).missing).toEqual(["VANTA_TELEGRAM_TOKEN"]);
    expect(platformAvailability(tg, { VANTA_TELEGRAM_TOKEN: "123:abc" }).configured).toBe(true);
  });

  it("treats a blank env value as missing", () => {
    const tg = messagingPlatformById("telegram")!;
    expect(platformAvailability(tg, { VANTA_TELEGRAM_TOKEN: "   " }).configured).toBe(false);
  });

  it("whatsapp is implemented via the Cloud API (token + phone id)", () => {
    const wa = messagingPlatformById("whatsapp");
    expect(wa?.implemented).toBe(true);
    expect(wa?.requiredEnv).toContain("VANTA_WHATSAPP_TOKEN");
    expect(wa?.requiredEnv).toContain("VANTA_WHATSAPP_PHONE_ID");
    expect(wa?.secretEnv).toBe("VANTA_WHATSAPP_TOKEN");
  });
});
