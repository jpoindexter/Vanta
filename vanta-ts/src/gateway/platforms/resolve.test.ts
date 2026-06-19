import { describe, it, expect } from "vitest";
import { resolvePlatform } from "./resolve.js";

describe("resolvePlatform", () => {
  it("returns undefined when no messaging platform is configured", () => {
    expect(resolvePlatform({})).toBeUndefined();
  });

  it("selects the Telegram adapter when a bot token is set", () => {
    const adapter = resolvePlatform({ VANTA_TELEGRAM_TOKEN: "123:abc" });
    expect(adapter?.id).toBe("telegram");
  });

  it("selects the ntfy adapter when a topic is set and no Telegram token", () => {
    const adapter = resolvePlatform({ VANTA_NTFY_TOPIC: "my-topic" });
    expect(adapter?.id).toBe("ntfy");
  });

  it("selects the Mattermost adapter when url + token + channel are all set", () => {
    const adapter = resolvePlatform({
      VANTA_MATTERMOST_URL: "https://mm.example",
      VANTA_MATTERMOST_TOKEN: "tok",
      VANTA_MATTERMOST_CHANNEL: "c1",
    });
    expect(adapter?.id).toBe("mattermost");
  });

  it("does not select Mattermost when the channel is missing", () => {
    const adapter = resolvePlatform({
      VANTA_MATTERMOST_URL: "https://mm.example",
      VANTA_MATTERMOST_TOKEN: "tok",
    });
    expect(adapter).toBeUndefined();
  });

  it("selects the IRC adapter when server + nick + channel are all set", () => {
    const adapter = resolvePlatform({
      VANTA_IRC_SERVER: "irc.libera.chat:6667",
      VANTA_IRC_NICK: "vanta",
      VANTA_IRC_CHANNEL: "#vanta",
    });
    expect(adapter?.id).toBe("irc");
  });

  it("does not select IRC when the channel is missing", () => {
    const adapter = resolvePlatform({
      VANTA_IRC_SERVER: "irc.libera.chat:6667",
      VANTA_IRC_NICK: "vanta",
    });
    expect(adapter).toBeUndefined();
  });

  it("prefers Mattermost over IRC when both are configured", () => {
    const adapter = resolvePlatform({
      VANTA_MATTERMOST_URL: "https://mm.example",
      VANTA_MATTERMOST_TOKEN: "tok",
      VANTA_MATTERMOST_CHANNEL: "c1",
      VANTA_IRC_SERVER: "irc.libera.chat:6667",
      VANTA_IRC_NICK: "vanta",
      VANTA_IRC_CHANNEL: "#vanta",
    });
    expect(adapter?.id).toBe("mattermost");
  });

  it("prefers Telegram over ntfy when both are configured", () => {
    const adapter = resolvePlatform({ VANTA_TELEGRAM_TOKEN: "123:abc", VANTA_NTFY_TOPIC: "my-topic" });
    expect(adapter?.id).toBe("telegram");
  });

  it("prefers Telegram over Mattermost when both are configured", () => {
    const adapter = resolvePlatform({
      VANTA_TELEGRAM_TOKEN: "123:abc",
      VANTA_MATTERMOST_URL: "https://mm.example",
      VANTA_MATTERMOST_TOKEN: "tok",
      VANTA_MATTERMOST_CHANNEL: "c1",
    });
    expect(adapter?.id).toBe("telegram");
  });

  it("treats a blank topic as not configured", () => {
    expect(resolvePlatform({ VANTA_NTFY_TOPIC: "   " })).toBeUndefined();
  });
});
