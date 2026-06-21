import { describe, it, expect } from "vitest";
import {
  resolveChicagoServer,
  makeChicagoRouter,
  connectChicago,
  isTransport,
  type ChicagoConnectDeps,
  type ChicagoClient,
  type CallMcp,
} from "./chicago-client.js";
import { CHICAGO_ENV } from "./chicago-route.js";
import type { ComputerAction } from "./chicago-route.js";

describe("resolveChicagoServer", () => {
  it("returns null when the env var is unset (OFF by default)", () => {
    expect(resolveChicagoServer({})).toBeNull();
  });

  it("returns null for an empty / blank value", () => {
    expect(resolveChicagoServer({ [CHICAGO_ENV]: "" })).toBeNull();
    expect(resolveChicagoServer({ [CHICAGO_ENV]: "   " })).toBeNull();
  });

  it("returns the trimmed server name when set", () => {
    expect(resolveChicagoServer({ [CHICAGO_ENV]: "  chicago  " })).toBe("chicago");
  });
});

describe("makeChicagoRouter — reuses routeComputerAction over an injected callMcp", () => {
  it("routes a screenshot through the mounted computer tool and parses the result", async () => {
    const calls: Array<{ tool: string; args: Record<string, unknown> }> = [];
    const callMcp: CallMcp = async (tool, args) => {
      calls.push({ tool, args });
      return { content: [{ type: "image", data: "SHOT" }] };
    };
    const router = makeChicagoRouter({ callMcp, server: "chicago" });
    const r = await router.run({ kind: "screenshot" });
    expect(r).toEqual({ ok: true, screenshotBase64: "SHOT" });
    // Reuses the pure route: the call envelope is the computer-tool shape.
    expect(calls).toEqual([{ tool: "computer", args: { action: "screenshot" } }]);
    expect(router.server).toBe("chicago");
  });

  it("routes a click → left_click coordinate and parses text", async () => {
    const callMcp: CallMcp = async (_tool, args) => {
      expect(args).toEqual({ action: "left_click", coordinate: [100, 200] });
      return { content: [{ type: "text", text: "clicked" }] };
    };
    const router = makeChicagoRouter({ callMcp });
    const action: ComputerAction = { kind: "click", x: 100, y: 200 };
    expect(await router.run(action)).toEqual({ ok: true, text: "clicked" });
  });

  it("carries `type` text verbatim (data, never interpreted as a command)", async () => {
    let seen: Record<string, unknown> | null = null;
    const callMcp: CallMcp = async (_t, args) => {
      seen = args;
      return { content: [{ type: "text", text: "typed" }] };
    };
    const router = makeChicagoRouter({ callMcp });
    await router.run({ kind: "type", text: "rm -rf / ; echo $HOME" });
    expect(seen).toEqual({ action: "type", text: "rm -rf / ; echo $HOME" });
  });

  it("returns {ok:false} (never throws) when the injected callMcp rejects", async () => {
    const router = makeChicagoRouter({
      callMcp: async () => {
        throw new Error("server down");
      },
    });
    const r = await router.run({ kind: "key", key: "esc" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("server down");
  });

  it("defaults the server name to 'chicago' when none is supplied", () => {
    expect(makeChicagoRouter({ callMcp: async () => ({ content: [] }) }).server).toBe("chicago");
  });
});

/** A fake connected client whose rawCallTool records calls and yields content blocks. */
function fakeClient(): ChicagoClient & { calls: Array<[string, Record<string, unknown>]>; closed: boolean } {
  const calls: Array<[string, Record<string, unknown>]> = [];
  const client = {
    calls,
    closed: false,
    rawCallTool: async (tool: string, args: Record<string, unknown>) => {
      calls.push([tool, args]);
      return { content: [{ type: "text", text: "ok" }] };
    },
    close() {
      client.closed = true;
    },
  };
  return client;
}

describe("connectChicago — the REAL connection path (mock mount/connect seam)", () => {
  it("connects the configured server and returns a router bound to its raw caller", async () => {
    const client = fakeClient();
    const mounted: string[] = [];
    const deps: ChicagoConnectDeps = {
      mountServer: async (name) => {
        mounted.push(name);
        return { command: "computer-use-mcp", args: [] };
      },
      createMcpClient: async (spec) => {
        expect(spec).toEqual({ command: "computer-use-mcp", args: [] });
        return client;
      },
    };
    const router = await connectChicago({ [CHICAGO_ENV]: "chicago" }, deps);
    expect(mounted).toEqual(["chicago"]);
    const r = await router.run({ kind: "click", x: 5, y: 6 });
    expect(r).toEqual({ ok: true, text: "ok" });
    // The router routed through the REAL client's raw caller, computer-tool shape.
    expect(client.calls).toEqual([["computer", { action: "left_click", coordinate: [5, 6] }]]);
  });

  it("fails closed (router.run → {ok:false}) when the env var is unset — never throws", async () => {
    const deps: ChicagoConnectDeps = {
      mountServer: async () => {
        throw new Error("should not be called");
      },
      createMcpClient: async () => null,
    };
    const router = await connectChicago({}, deps);
    const r = await router.run({ kind: "screenshot" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("not set");
  });

  it("fails closed when the server is not configured (mountServer → null)", async () => {
    const deps: ChicagoConnectDeps = {
      mountServer: async () => null,
      createMcpClient: async () => fakeClient(),
    };
    const router = await connectChicago({ [CHICAGO_ENV]: "ghost" }, deps);
    const r = await router.run({ kind: "screenshot" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("not configured");
  });

  it("fails closed when the client cannot connect (createMcpClient → null)", async () => {
    const deps: ChicagoConnectDeps = {
      mountServer: async () => ({ command: "x" }),
      createMcpClient: async () => null,
    };
    const router = await connectChicago({ [CHICAGO_ENV]: "chicago" }, deps);
    const r = await router.run({ kind: "screenshot" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("could not connect");
  });

  it("fails closed (catches) when the mount/connect seam throws — never throws", async () => {
    const deps: ChicagoConnectDeps = {
      mountServer: async () => {
        throw new Error("spawn EACCES");
      },
      createMcpClient: async () => fakeClient(),
    };
    const router = await connectChicago({ [CHICAGO_ENV]: "chicago" }, deps);
    const r = await router.run({ kind: "click", x: 1, y: 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("EACCES");
  });

  it("a connect-time client-call failure surfaces as {ok:false}, never a throw", async () => {
    const deps: ChicagoConnectDeps = {
      mountServer: async () => ({ command: "x" }),
      createMcpClient: async () => ({
        rawCallTool: async () => {
          throw new Error("call timed out");
        },
        close: () => {},
      }),
    };
    const router = await connectChicago({ [CHICAGO_ENV]: "chicago" }, deps);
    const r = await router.run({ kind: "screenshot" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("call timed out");
  });
});

describe("isTransport guard", () => {
  it("recognizes a real-shaped transport and rejects non-transports", () => {
    expect(isTransport({ send() {}, onMessage() {}, onError() {}, close() {} })).toBe(true);
    expect(isTransport({})).toBe(false);
    expect(isTransport(null)).toBe(false);
    expect(isTransport("nope")).toBe(false);
  });
});
