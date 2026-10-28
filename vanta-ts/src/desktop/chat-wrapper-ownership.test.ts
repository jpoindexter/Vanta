import type http from "node:http";
import { describe, expect, it, vi } from "vitest";
import { handlePublicApiRoute } from "../public-api/routes.js";
import { handleCompanionRoute } from "../companion/routes.js";
import type { DesktopState } from "./handler-state.js";
import type { SseClients } from "./session-state.js";

vi.mock("../public-api/auth.js", () => ({ authenticatePublicApiToken: async () => ({ id: "fixture" }) }));

describe("rejected remote chat does not settle the active owner's stream", () => {
  it.each(["public", "companion"])("preserves owner streaming and emits no false completion (%s)", async (host) => {
    const frames: string[] = [];
    const controller = new AbortController();
    const clients: SseClients = new Map([["client", new Set([{
      response: { write: (frame: string) => { frames.push(frame); } } as unknown as http.ServerResponse,
      encode: (event) => ({ data: event }), typed: true,
    }])]]);
    const state: DesktopState = { root: "/fixture", _chatActive: true, _chatAbort: controller,
      _streamTextDeltas: true, _sseClients: clients, _sseSessionId: "client" };
    const pathname = host === "public" ? "/api/v1/input" : "/api/companion/chat";
    const req = { method: "POST", headers: { authorization: "Bearer private-fixture" } } as http.IncomingMessage;
    const res = { statusCode: 200, writeHead(this: { statusCode: number }, status: number) { this.statusCode = status; }, end() {} } as unknown as http.ServerResponse;
    const args = { state, req, res, pathname, sid: "client", sseClients: clients };
    if (host === "public") await handlePublicApiRoute({ ...args, options: { enabled: true, home: "/fixture", allowedOrigins: new Set() } });
    else await handleCompanionRoute({ ...args, local: true, options: { enabled: true, home: "/fixture", port: 0 } });
    expect(res.statusCode).toBe(409);
    expect(state._streamTextDeltas).toBe(true);
    expect(state._chatActive).toBe(true);
    expect(state._chatAbort).toBe(controller);
    expect(controller.signal.aborted).toBe(false);
    expect(frames).toEqual([]);
  });
});
