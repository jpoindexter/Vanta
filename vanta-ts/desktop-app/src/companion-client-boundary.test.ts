import { afterEach, describe, expect, it, vi } from "vitest";
import { companionClient, streamCompanionEvents } from "./companion-client.js";

afterEach(() => vi.unstubAllGlobals());

function fixture(origin = "http://127.0.0.1:7790") {
  vi.stubGlobal("window", { location: new URL(`${origin}/companion`), vantaDesktop: { boundaryToken: "fixture-boundary" } });
  const fetchMock = vi.fn<typeof fetch>(async () => new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("companion client desktop boundary credentials", () => {
  it.each(["", "http://127.0.0.1:7790/"])("authenticates same-origin local requests for host=%s", async (host) => {
    const fetchMock = fixture();
    await companionClient("", host)("/approval", { headers: { "content-type": "application/json" } });
    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(headers.get("x-vanta-desktop-boundary")).toBe("fixture-boundary");
    expect(headers.get("content-type")).toBe("application/json");
  });

  it.each(["http://192.0.2.1:7790", "http://127.0.0.1:7791", "http://localhost:7790"])("never forwards the desktop credential to another origin %s", async (host) => {
    const fetchMock = fixture();
    await companionClient("fixture-bearer", host)("/approval");
    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(headers.get("x-vanta-desktop-boundary")).toBeNull();
    expect(headers.get("authorization")).toBe("Bearer fixture-bearer");
  });

  it("does not treat a same-origin remote page as trusted Desktop", async () => {
    const fetchMock = fixture("http://192.0.2.1:7790");
    await companionClient("fixture-bearer")("/approval");
    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(headers.get("x-vanta-desktop-boundary")).toBeNull();
    expect(headers.get("authorization")).toBe("Bearer fixture-bearer");
  });

  it("keeps native cross-origin requests bearer-only", async () => {
    const fetchMock = fixture("capacitor://localhost");
    await companionClient("fixture-bearer", "http://127.0.0.1:7790")("/approval");
    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(headers.get("x-vanta-desktop-boundary")).toBeNull();
    expect(headers.get("authorization")).toBe("Bearer fixture-bearer");
  });

  it.each(["", "http://192.0.2.1:7790"])("scopes streaming credentials to their intended origin for host=%s", async (host) => {
    const fetchMock = fixture();
    await streamCompanionEvents({ token: "fixture-bearer", host, signal: new AbortController().signal, onEvent: () => {} });
    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(headers.get("x-vanta-desktop-boundary")).toBe(host ? null : "fixture-boundary");
    expect(headers.get("authorization")).toBe("Bearer fixture-bearer");
  });
});
