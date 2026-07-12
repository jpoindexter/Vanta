import { describe, expect, it } from "vitest";
import { VantaClient, type VantaEvent } from "../../packages/sdk/src/index.js";

describe("VantaClient streamInput", () => {
  it("routes liveness, readiness, and status without starting a session", async () => {
    const paths: string[] = [];
    const client = new VantaClient({
      baseUrl: "http://vanta.test",
      token: "secret",
      fetch: (async (input: string | URL | Request) => {
        const path = new URL(String(input)).pathname; paths.push(path);
        return Response.json(path.endsWith("/live") ? { apiVersion: "v1", status: "live" } : { apiVersion: "v1", status: "ready", checks: {} });
      }) as typeof fetch,
    });
    await expect(client.live()).resolves.toMatchObject({ status: "live" });
    await expect(client.readiness()).resolves.toMatchObject({ status: "ready" });
    await expect(client.status()).resolves.toMatchObject({ status: "ready" });
    expect(paths).toEqual(["/api/v1/live", "/api/v1/readiness", "/api/v1/status"]);
  });

  it("opens SSE before input and resolves on the terminal frame", async () => {
    const calls: string[] = [];
    const encoder = new TextEncoder();
    let stream: ReadableStreamDefaultController<Uint8Array> | undefined;
    const fetchImpl = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      calls.push(url.endsWith("/events") ? "events" : "input");
      if (url.endsWith("/events")) {
        return new Response(new ReadableStream({ start: (controller) => { stream = controller; } }), { status: 200 });
      }
      expect(init?.method).toBe("POST");
      stream?.enqueue(encoder.encode('event: output.delta\ndata: {"apiVersion":"v1","type":"output.delta","sessionId":"test","delta":"OK"}\n\n'));
      stream?.enqueue(encoder.encode('event: turn.completed\ndata: {"apiVersion":"v1","type":"turn.completed","sessionId":"test","ok":true}\n\n'));
      return Response.json({ finalText: "OK", events: [], sessionId: "session-1" });
    };
    const client = new VantaClient({ baseUrl: "http://vanta.test", token: "secret", channelId: "test", fetch: fetchImpl as typeof fetch });
    const events: VantaEvent[] = [];

    await expect(client.streamInput("go", (event) => events.push(event))).resolves.toMatchObject({ finalText: "OK" });
    expect(calls).toEqual(["events", "input"]);
    expect(events.map((event) => event.type)).toEqual(["output.delta", "turn.completed"]);
  });
});
