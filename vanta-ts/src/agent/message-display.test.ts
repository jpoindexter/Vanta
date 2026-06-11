import { describe, it, expect } from "vitest";
import { HookBus } from "../plugins/hooks.js";
import {
  stripThinking,
  applyMessageDisplay,
  registerStripThinking,
  installMessageDisplayHooks,
} from "./message-display.js";

describe("stripThinking", () => {
  it("removes a <thinking> block but keeps the answer", () => {
    expect(stripThinking("<thinking>plan the thing</thinking>\nThe answer is 42.")).toBe("The answer is 42.");
  });

  it("removes <think> blocks too, and trims", () => {
    expect(stripThinking("<think>hmm</think>  hi")).toBe("hi");
  });

  it("removes multiple blocks", () => {
    expect(stripThinking("<thinking>a</thinking>X<thinking>b</thinking>Y")).toBe("XY");
  });

  it("leaves text without thinking untouched", () => {
    expect(stripThinking("just text")).toBe("just text");
  });
});

describe("applyMessageDisplay", () => {
  it("returns text unchanged with no bus", async () => {
    expect(await applyMessageDisplay(undefined, "hi")).toEqual({ text: "hi", suppressed: false });
  });

  it("returns text unchanged when no hook acts", async () => {
    expect(await applyMessageDisplay(new HookBus(), "hi")).toEqual({ text: "hi", suppressed: false });
  });

  it("applies a rewrite hook", async () => {
    const bus = new HookBus();
    bus.on("message_display", ({ text }) => ({ action: "rewrite", rewrittenText: text.toUpperCase() }));
    expect(await applyMessageDisplay(bus, "hi")).toEqual({ text: "HI", suppressed: false });
  });

  it("applies a suppress hook", async () => {
    const bus = new HookBus();
    bus.on("message_display", () => ({ action: "suppress" }));
    expect(await applyMessageDisplay(bus, "secret")).toEqual({ text: "", suppressed: true });
  });

  it("first non-allow hook wins", async () => {
    const bus = new HookBus();
    bus.on("message_display", () => ({ action: "allow" }));
    bus.on("message_display", ({ text }) => ({ action: "rewrite", rewrittenText: `${text}!` }));
    bus.on("message_display", () => ({ action: "suppress" }));
    expect(await applyMessageDisplay(bus, "hi")).toEqual({ text: "hi!", suppressed: false });
  });
});

describe("registerStripThinking", () => {
  it("rewrites only when a thinking block is present", async () => {
    const bus = new HookBus();
    registerStripThinking(bus);
    expect(await applyMessageDisplay(bus, "<thinking>x</thinking>answer")).toEqual({ text: "answer", suppressed: false });
    expect(await applyMessageDisplay(bus, "plain")).toEqual({ text: "plain", suppressed: false });
  });

  it("unsubscribes cleanly", async () => {
    const bus = new HookBus();
    const off = registerStripThinking(bus);
    off();
    expect(bus.count("message_display")).toBe(0);
    expect(await applyMessageDisplay(bus, "<thinking>x</thinking>y")).toEqual({ text: "<thinking>x</thinking>y", suppressed: false });
  });
});

describe("installMessageDisplayHooks", () => {
  it("registers strip-thinking only when VANTA_STRIP_THINKING is enabled", () => {
    const on = new HookBus();
    installMessageDisplayHooks(on, { VANTA_STRIP_THINKING: "1" } as NodeJS.ProcessEnv);
    expect(on.count("message_display")).toBe(1);

    const off = new HookBus();
    installMessageDisplayHooks(off, {} as NodeJS.ProcessEnv);
    expect(off.count("message_display")).toBe(0);
  });
});
