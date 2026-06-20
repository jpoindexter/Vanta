import { describe, it, expect } from "vitest";
import {
  createAdapter,
  resolveMessagingAdapter,
  implementedPlatformIds,
} from "./factory.js";

// Guard: a CreateAdapterError, not a built adapter.
function isErr(v: unknown): v is { ok: false; error: string } {
  return typeof v === "object" && v !== null && "ok" in v && (v as { ok: unknown }).ok === false;
}

describe("createAdapter", () => {
  it("returns the telegram adapter for an implemented id with its env set", () => {
    const adapter = createAdapter("telegram", { VANTA_TELEGRAM_TOKEN: "123:abc" });
    expect(isErr(adapter)).toBe(false);
    expect((adapter as { id: string }).id).toBe("telegram");
  });

  it("returns the ntfy adapter for an implemented id with its env set", () => {
    const adapter = createAdapter("ntfy", { VANTA_NTFY_TOPIC: "my-topic" });
    expect((adapter as { id: string }).id).toBe("ntfy");
  });

  it("returns the mattermost adapter when url + token + channel are set", () => {
    const adapter = createAdapter("mattermost", {
      VANTA_MATTERMOST_URL: "https://mm.example",
      VANTA_MATTERMOST_TOKEN: "tok",
      VANTA_MATTERMOST_CHANNEL: "c1",
    });
    expect((adapter as { id: string }).id).toBe("mattermost");
  });

  it("returns the irc adapter when server + nick + channel are set", () => {
    const adapter = createAdapter("irc", {
      VANTA_IRC_SERVER: "irc.libera.chat:6667",
      VANTA_IRC_NICK: "vanta",
      VANTA_IRC_CHANNEL: "#vanta",
    });
    expect((adapter as { id: string }).id).toBe("irc");
  });

  it("returns the imessage adapter when its opt-in flag is set (gap the if-chain missed)", () => {
    const adapter = createAdapter("imessage", { VANTA_IMESSAGE_ENABLE: "1" });
    expect((adapter as { id: string }).id).toBe("imessage");
  });

  it("returns the signal adapter when its daemon url + number are set (gap the if-chain missed)", () => {
    const adapter = createAdapter("signal", {
      VANTA_SIGNAL_URL: "http://127.0.0.1:8080",
      VANTA_SIGNAL_NUMBER: "+15551234567",
    });
    expect((adapter as { id: string }).id).toBe("signal");
  });

  it("returns a clear error for an unimplemented platform id", () => {
    const result = createAdapter("whatsapp", { VANTA_WHATSAPP_ENABLE: "1" });
    expect(isErr(result)).toBe(true);
    expect((result as { error: string }).error).toMatch(/No messaging adapter for "whatsapp"/);
  });

  it("returns a clear error for an unknown id and lists the implemented ones", () => {
    const result = createAdapter("carrier-pigeon", {});
    expect(isErr(result)).toBe(true);
    expect((result as { error: string }).error).toContain("telegram");
  });

  it("returns a clear error when an implemented id is missing its env", () => {
    const result = createAdapter("telegram", {});
    expect(isErr(result)).toBe(true);
    expect((result as { error: string }).error).toMatch(/not configured/);
  });
});

describe("resolveMessagingAdapter", () => {
  it("returns undefined when no platform is configured", () => {
    expect(resolveMessagingAdapter({})).toBeUndefined();
  });

  it("selects telegram when a bot token is set", () => {
    expect(resolveMessagingAdapter({ VANTA_TELEGRAM_TOKEN: "123:abc" })?.id).toBe("telegram");
  });

  it("selects ntfy when only a topic is set", () => {
    expect(resolveMessagingAdapter({ VANTA_NTFY_TOPIC: "my-topic" })?.id).toBe("ntfy");
  });

  it("prefers telegram over ntfy when both are configured (registration order)", () => {
    const adapter = resolveMessagingAdapter({
      VANTA_TELEGRAM_TOKEN: "123:abc",
      VANTA_NTFY_TOPIC: "my-topic",
    });
    expect(adapter?.id).toBe("telegram");
  });

  it("treats a blank env value as not configured", () => {
    expect(resolveMessagingAdapter({ VANTA_NTFY_TOPIC: "   " })).toBeUndefined();
  });

  it("resolves imessage when only its opt-in flag is set", () => {
    expect(resolveMessagingAdapter({ VANTA_IMESSAGE_ENABLE: "1" })?.id).toBe("imessage");
  });
});

describe("implementedPlatformIds", () => {
  it("lists exactly the six implemented messaging platforms in priority order", () => {
    expect(implementedPlatformIds()).toEqual([
      "telegram",
      "mattermost",
      "irc",
      "ntfy",
      "imessage",
      "signal",
    ]);
  });
});
