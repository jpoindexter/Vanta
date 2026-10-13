import http from "node:http";
import type { AddressInfo } from "node:net";
import type { DesktopState } from "../handler-state.js";
import { createDesktopServer } from "../server.js";

// Test harness: a real desktop HTTP server plus real SSE clients, so typed events
// are observed on the wire exactly as the renderer will see them.

export const BOUNDARY_TOKEN = "t".repeat(64);

export type SseFrameJson = Record<string, unknown> & { label?: string; typed?: { type: string } & Record<string, unknown> };

export type SseProbe = { frames: SseFrameJson[]; waitFor: (pred: (frame: SseFrameJson) => boolean) => Promise<SseFrameJson>; close: () => void };

export type TestServer = { port: number; close: () => Promise<void> };

export function freshState(id: string, root: string): DesktopState {
  return {
    root, sessionId: id, sessionStarted: "2026-01-01T00:00:00.000Z",
    setup: { provider: { modelId: () => "fake", contextWindow: () => 200_000 } as never, goals: [], registry: {} as never, safety: {} as never, systemPrompt: "" } as never,
  };
}

export async function startServer(root: string, sessions: Map<string, DesktopState>): Promise<TestServer> {
  const server = createDesktopServer(root, { sessions, boundaryToken: BOUNDARY_TOKEN });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    port: (server.address() as AddressInfo).port,
    close: async () => { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); },
  };
}

export function headers(sessionId: string): Record<string, string> {
  return { "content-type": "application/json", "x-vanta-desktop-boundary": BOUNDARY_TOKEN, "x-session-id": sessionId };
}

export async function openSse(port: number, sessionId: string): Promise<SseProbe> {
  const frames: SseFrameJson[] = [];
  const req = await new Promise<http.ClientRequest>((resolve, reject) => {
    const request = http.get({ host: "127.0.0.1", port, path: "/api/events", headers: headers(sessionId) }, (res) => {
      let buffer = "";
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => {
        buffer += chunk;
        for (let end = buffer.indexOf("\n\n"); end >= 0; end = buffer.indexOf("\n\n")) {
          const block = buffer.slice(0, end); buffer = buffer.slice(end + 2);
          const data = block.split("\n").find((line) => line.startsWith("data: "));
          if (data) frames.push(JSON.parse(data.slice(6)) as SseFrameJson);
        }
      });
      resolve(request);
    });
    request.on("error", reject);
  });
  const waitFor = async (pred: (frame: SseFrameJson) => boolean): Promise<SseFrameJson> => {
    for (let attempt = 0; attempt < 300; attempt++) {
      const hit = frames.find(pred);
      if (hit) return hit;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`timed out waiting for SSE frame; saw ${JSON.stringify(frames)}`);
  };
  return { frames, waitFor, close: () => req.destroy() };
}

export const typedOf = (frames: SseFrameJson[]) => frames.flatMap((frame) => (frame.typed ? [frame.typed] : []));
