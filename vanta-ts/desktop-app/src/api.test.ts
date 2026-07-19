import { afterEach, describe, expect, it, vi } from "vitest";
import { api, desktopEventSourceUrl } from "./api.js";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("desktop API launch boundary", () => {
  it("attaches the preload token to fetch and SSE requests", async () => {
    vi.stubGlobal("window", { vantaDesktop: { boundaryToken: "launch-secret" } });
    const fetchMock = vi.fn(async (_path: string, init?: RequestInit) => ({ ok: true, status: 200, text: async () => JSON.stringify({ headers: Object.fromEntries(new Headers(init?.headers)) }) }));
    vi.stubGlobal("fetch", fetchMock);

    await api("/api/status");

    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(headers.get("x-vanta-desktop-boundary")).toBe("launch-secret");
    expect(desktopEventSourceUrl("/api/events")).toBe("/api/events?boundary=launch-secret");
  });
});
