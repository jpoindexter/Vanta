import { createServer } from "node:http";
import { describe, expect, it } from "vitest";
import { createTelegramFetch, ipv4Fetch, parseTelegramFallbackIps } from "./ipv4-fetch.js";

describe("ipv4Fetch", () => {
  it("sends a request body and exposes a standard Response", async () => {
    const server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ method: request.method, body: Buffer.concat(chunks).toString() }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("test server did not bind");
    try {
      const response = await ipv4Fetch(`http://127.0.0.1:${address.port}/telegram`, { method: "POST", body: "probe" });
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ method: "POST", body: "probe" });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("falls back to an IPv4 address while preserving the Telegram host", async () => {
    let receivedHost = "";
    const server = createServer((request, response) => {
      receivedHost = request.headers.host ?? "";
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: true }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("test server did not bind");
    try {
      const fetch = createTelegramFetch({ fallbackIps: ["127.0.0.1"], timeoutMs: 25 });
      const response = await fetch(`http://api.telegram.org:${address.port}/telegram`);
      expect(response.status).toBe(200);
      expect(receivedHost).toBe(`api.telegram.org:${address.port}`);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("accepts only numeric IPv4 fallback entries", () => {
    expect(parseTelegramFallbackIps("149.154.166.110, 127.0.0.1, api.telegram.org, 999.1.1.1")).toEqual([
      "149.154.166.110",
      "127.0.0.1",
    ]);
    expect(parseTelegramFallbackIps("  ")).toBeUndefined();
  });
});
