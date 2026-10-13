import { describe, expect, it, vi } from "vitest";

import { CH } from "./channels";
import { createDeepLinkRouter, deepLinkFromArgv, parseDeepLink } from "./deep-links";

describe("parseDeepLink", () => {
  it("reads kind, name and params from a vanta:// link", () => {
    expect(parseDeepLink("vanta://session/abc-123?from=notification")).toEqual({
      kind: "session",
      name: "abc-123",
      params: { from: "notification" }
    });
    expect(parseDeepLink("vanta://connections/done?op=o1&status=ok")).toEqual({
      kind: "connections",
      name: "done",
      params: { op: "o1", status: "ok" }
    });
    expect(parseDeepLink("vanta://blueprint/review%20pr")).toMatchObject({ kind: "blueprint", name: "review pr" });
  });

  it.each([
    ["a plugin install, which would run code", "vanta://plugin/install?repo=https://evil.example/x.git"],
    ["a skill install", "vanta://skill/install?identifier=evil"],
    ["an MCP install", "vanta://mcp/install?name=evil"],
    ["another scheme", "hermes://session/abc"],
    ["http", "https://session/abc"],
    ["javascript", "javascript:alert(1)"],
    ["a kind that is not a word", "vanta://SESSION%00/abc"],
    ["a control character in the name", "vanta://session/a%0Ab"],
    ["a bad escape", "vanta://session/%E0%A4%A"],
    ["a huge value", `vanta://session/a?x=${"y".repeat(2001)}`],
    ["too many params", `vanta://session/a?${Array.from({ length: 21 }, (_, i) => `k${i}=v`).join("&")}`],
    ["an overlong link", `vanta://session/${"a".repeat(5000)}`],
    ["a non-string", 42],
    ["nothing", ""]
  ])("drops %s", (_label, raw) => {
    expect(parseDeepLink(raw)).toBeNull();
  });
});

describe("deep link router", () => {
  const setup = () => {
    const send = vi.fn();
    const focusWindow = vi.fn();

    return { focusWindow, router: createDeepLinkRouter({ focusWindow, send }), send };
  };

  it("holds links until the renderer says it is listening, then delivers them in order", () => {
    const { router, send } = setup();

    router.handleUrl("vanta://blueprint/one");
    router.handleUrl("vanta://blueprint/two");
    expect(send).not.toHaveBeenCalled();
    expect(router.pendingCount()).toBe(2);

    router.markReady();

    expect(send.mock.calls.map(call => call[1].name)).toEqual(["one", "two"]);
    expect(send.mock.calls[0]?.[0]).toBe(CH.deepLink);
  });

  it("opens a session by focusing it, and brings the window forward", () => {
    const { focusWindow, router, send } = setup();

    router.markReady();
    router.handleUrl("vanta://session/s-9");

    expect(send).toHaveBeenCalledWith(CH.focusSession, "s-9");
    expect(focusWindow).toHaveBeenCalledTimes(1);
  });

  it("holds new links again after the window reloads", () => {
    const { router, send } = setup();

    router.markReady();
    router.markNotReady();
    router.handleUrl("vanta://blueprint/x");

    expect(send).not.toHaveBeenCalled();
  });

  it("refuses an install link without even focusing the window", () => {
    const { focusWindow, router, send } = setup();

    router.markReady();

    expect(router.handleUrl("vanta://skill/install?identifier=evil")).toBe(false);
    expect(send).not.toHaveBeenCalled();
    expect(focusWindow).not.toHaveBeenCalled();
  });

  it("caps how many links it will hold", () => {
    const { router } = setup();

    for (let index = 0; index < 50; index += 1) {
      router.handleUrl(`vanta://blueprint/n${index}`);
    }

    expect(router.pendingCount()).toBe(20);
  });
});

describe("deepLinkFromArgv", () => {
  it("finds a vanta:// argument and nothing else", () => {
    expect(deepLinkFromArgv(["/app", "--flag", "VANTA://session/a"])).toBe("VANTA://session/a");
    expect(deepLinkFromArgv(["/app", "https://example.com"])).toBeUndefined();
  });
});
