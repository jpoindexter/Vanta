import { describe, it, expect } from "vitest";
import {
  buildChicagoCall,
  parseChicagoResult,
  chicagoEnabled,
  routeComputerAction,
  CHICAGO_TOOL,
  CHICAGO_ENV,
  type ComputerAction,
  type ChicagoDeps,
} from "./chicago-route.js";

describe("buildChicagoCall", () => {
  it("maps screenshot → {action:'screenshot'} on the computer tool", () => {
    const call = buildChicagoCall({ kind: "screenshot" });
    expect(call.tool).toBe(CHICAGO_TOOL);
    expect(call.args).toEqual({ action: "screenshot" });
  });

  it("maps click → left_click with a [x,y] coordinate", () => {
    const call = buildChicagoCall({ kind: "click", x: 12, y: 34 });
    expect(call.tool).toBe("computer");
    expect(call.args).toEqual({ action: "left_click", coordinate: [12, 34] });
  });

  it("maps type → {action:'type', text} with the text carried verbatim (data, not a command)", () => {
    const call = buildChicagoCall({ kind: "type", text: "rm -rf / ; echo $HOME" });
    expect(call.args).toEqual({ action: "type", text: "rm -rf / ; echo $HOME" });
  });

  it("maps key → {action:'key', text:key}", () => {
    const call = buildChicagoCall({ kind: "key", key: "cmd+shift+4" });
    expect(call.args).toEqual({ action: "key", text: "cmd+shift+4" });
  });

  it("maps scroll down (positive dy) → scroll_direction 'down' + positive amount", () => {
    const call = buildChicagoCall({ kind: "scroll", x: 5, y: 6, dy: 3 });
    expect(call.args).toEqual({
      action: "scroll",
      coordinate: [5, 6],
      scroll_direction: "down",
      scroll_amount: 3,
    });
  });

  it("maps scroll up (negative dy) → scroll_direction 'up' + absolute amount", () => {
    const call = buildChicagoCall({ kind: "scroll", x: 5, y: 6, dy: -4 });
    expect(call.args).toEqual({
      action: "scroll",
      coordinate: [5, 6],
      scroll_direction: "up",
      scroll_amount: 4,
    });
  });
});

describe("parseChicagoResult", () => {
  it("parses an image content block → screenshotBase64", () => {
    const r = parseChicagoResult({ content: [{ type: "image", data: "AAA=", mimeType: "image/png" }] });
    expect(r).toEqual({ ok: true, screenshotBase64: "AAA=" });
  });

  it("parses a text content block → text", () => {
    const r = parseChicagoResult({ content: [{ type: "text", text: "clicked" }] });
    expect(r).toEqual({ ok: true, text: "clicked" });
  });

  it("returns both screenshot + joined text when both present", () => {
    const r = parseChicagoResult({
      content: [
        { type: "image", data: "IMG" },
        { type: "text", text: "line1" },
        { type: "text", text: "line2" },
      ],
    });
    expect(r).toEqual({ ok: true, screenshotBase64: "IMG", text: "line1\nline2" });
  });

  it("tolerates a {text}-only block with no explicit type", () => {
    const r = parseChicagoResult({ content: [{ text: "ok" }] });
    expect(r).toEqual({ ok: true, text: "ok" });
  });

  it("uses the first image block when several are present", () => {
    const r = parseChicagoResult({
      content: [
        { type: "image", data: "FIRST" },
        { type: "image", data: "SECOND" },
      ],
    });
    expect(r.ok && r.screenshotBase64).toBe("FIRST");
  });

  it("errors on a non-object result (garbage → error)", () => {
    const r = parseChicagoResult("not an object");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("not an object");
  });

  it("errors on null", () => {
    const r = parseChicagoResult(null);
    expect(r.ok).toBe(false);
  });

  it("errors when content is missing", () => {
    const r = parseChicagoResult({ somethingElse: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("no content blocks");
  });

  it("errors when content is an empty array", () => {
    const r = parseChicagoResult({ content: [] });
    expect(r.ok).toBe(false);
  });

  it("errors when no block carries an image or usable text", () => {
    const r = parseChicagoResult({ content: [{ type: "image" }, { type: "text" }, 42, null] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("no image or text");
  });

  it("ignores an empty-string image data and empty text (treats as no content)", () => {
    const r = parseChicagoResult({ content: [{ type: "image", data: "" }, { type: "text", text: "" }] });
    expect(r.ok).toBe(false);
  });
});

describe("chicagoEnabled", () => {
  it("is off by default (env var unset)", () => {
    expect(chicagoEnabled({})).toBe(false);
  });

  it("is off when set to an empty/blank string", () => {
    expect(chicagoEnabled({ [CHICAGO_ENV]: "" })).toBe(false);
    expect(chicagoEnabled({ [CHICAGO_ENV]: "   " })).toBe(false);
  });

  it("is on when set to a server name", () => {
    expect(chicagoEnabled({ [CHICAGO_ENV]: "chicago" })).toBe(true);
  });
});

describe("routeComputerAction", () => {
  it("builds the call, invokes callMcp, and parses a successful screenshot", async () => {
    const calls: Array<{ tool: string; args: Record<string, unknown> }> = [];
    const deps: ChicagoDeps = {
      callMcp: async (tool, args) => {
        calls.push({ tool, args });
        return { content: [{ type: "image", data: "SHOT" }] };
      },
    };
    const r = await routeComputerAction({ kind: "screenshot" }, deps);
    expect(r).toEqual({ ok: true, screenshotBase64: "SHOT" });
    expect(calls).toEqual([{ tool: "computer", args: { action: "screenshot" } }]);
  });

  it("routes a click and returns parsed text", async () => {
    const deps: ChicagoDeps = {
      callMcp: async (_tool, args) => {
        expect(args).toEqual({ action: "left_click", coordinate: [100, 200] });
        return { content: [{ type: "text", text: "ok" }] };
      },
    };
    const action: ComputerAction = { kind: "click", x: 100, y: 200 };
    const r = await routeComputerAction(action, deps);
    expect(r).toEqual({ ok: true, text: "ok" });
  });

  it("returns {ok:false} (never throws) when callMcp rejects", async () => {
    const deps: ChicagoDeps = {
      callMcp: async () => {
        throw new Error("server down");
      },
    };
    const r = await routeComputerAction({ kind: "type", text: "hi" }, deps);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("server down");
  });

  it("returns {ok:false} when callMcp yields a garbage result (never throws)", async () => {
    const deps: ChicagoDeps = { callMcp: async () => 12345 };
    const r = await routeComputerAction({ kind: "key", key: "esc" }, deps);
    expect(r.ok).toBe(false);
  });
});
