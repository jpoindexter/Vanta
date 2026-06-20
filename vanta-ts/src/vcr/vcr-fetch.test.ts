import { describe, it, expect, vi } from "vitest";
import { makeVcrFetch, resolveVcrMode, type FetchLike } from "./vcr-fetch.js";
import { recordInteraction, toRecordedRequest, type Cassette } from "./cassette.js";

interface StubFetch {
  fn: FetchLike;
  get calls(): number;
}

/** A real-fetch stub that counts calls and returns a fresh fixed Response. */
function stubFetch(status = 200, body = "live-body"): StubFetch {
  const mock = vi.fn(async () => new Response(body, { status }));
  return {
    fn: mock as unknown as FetchLike,
    get calls() {
      return mock.mock.calls.length;
    },
  };
}

/** A one-interaction cassette fixture (record helper inlined). */
function oneInteraction(method: string, url: string, body: string, respBody: string): Cassette {
  return recordInteraction([], toRecordedRequest(method, url, body), { status: 200, body: respBody });
}

describe("resolveVcrMode", () => {
  it("defaults to off when VANTA_VCR is unset", () => {
    expect(resolveVcrMode({})).toBe("off");
  });

  it("reads record and replay (case-insensitive, trimmed)", () => {
    expect(resolveVcrMode({ VANTA_VCR: "record" })).toBe("record");
    expect(resolveVcrMode({ VANTA_VCR: " REPLAY " })).toBe("replay");
  });

  it("falls back to off for an unrecognized value", () => {
    expect(resolveVcrMode({ VANTA_VCR: "loud" })).toBe("off");
  });
});

describe("makeVcrFetch — off mode", () => {
  it("passes straight through to realFetch", async () => {
    const real = stubFetch(200, "passthrough");
    const vcr = makeVcrFetch({ mode: "off", cassette: [], realFetch: real.fn });
    const res = await vcr("https://api.test");
    expect(real.calls).toBe(1);
    expect(await res.text()).toBe("passthrough");
  });

  it("does not record or save in off mode", async () => {
    const real = stubFetch();
    const save = vi.fn(async () => {});
    const cassette: Cassette = [];
    const vcr = makeVcrFetch({ mode: "off", cassette, realFetch: real.fn, save });
    await vcr("https://api.test");
    expect(cassette).toHaveLength(0);
    expect(save).not.toHaveBeenCalled();
  });
});

describe("makeVcrFetch — record mode", () => {
  it("calls realFetch, appends the interaction, and saves", async () => {
    const real = stubFetch(201, "recorded-body");
    const save = vi.fn(async () => {});
    const cassette: Cassette = [];
    const vcr = makeVcrFetch({ mode: "record", cassette, realFetch: real.fn, save });

    const res = await vcr("https://api.test/v1", { method: "POST", body: '{"a":1}' });

    expect(real.calls).toBe(1);
    expect(await res.text()).toBe("recorded-body"); // caller still gets the live response
    expect(cassette).toHaveLength(1);
    const [first] = cassette;
    expect(first?.request).toEqual(toRecordedRequest("POST", "https://api.test/v1", '{"a":1}'));
    expect(first?.response).toEqual({ status: 201, body: "recorded-body" });
    expect(save).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledWith(cassette);
  });

  it("does not consume the response body the caller reads (clones)", async () => {
    const real = stubFetch(200, "body-once");
    const vcr = makeVcrFetch({ mode: "record", cassette: [], realFetch: real.fn });
    const res = await vcr("https://api.test");
    // would throw "Body already read" if record consumed the original stream
    await expect(res.text()).resolves.toBe("body-once");
  });

  it("works without an injected save (best-effort persistence)", async () => {
    const real = stubFetch();
    const cassette: Cassette = [];
    const vcr = makeVcrFetch({ mode: "record", cassette, realFetch: real.fn });
    await expect(vcr("https://api.test")).resolves.toBeInstanceOf(Response);
    expect(cassette).toHaveLength(1);
  });
});

describe("makeVcrFetch — replay mode", () => {
  it("returns the recorded response for a match WITHOUT calling realFetch", async () => {
    const cassette = oneInteraction("POST", "https://api.test/v1", '{"a":1}', "replayed");
    const real = stubFetch();
    const vcr = makeVcrFetch({ mode: "replay", cassette, realFetch: real.fn });

    const res = await vcr("https://api.test/v1", { method: "POST", body: '{"a":1}' });

    expect(real.calls).toBe(0); // never hits the network
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("replayed");
  });

  it("returns a clear miss error (status 500) WITHOUT calling realFetch", async () => {
    const real = stubFetch();
    const vcr = makeVcrFetch({ mode: "replay", cassette: [], realFetch: real.fn });

    const res = await vcr("https://api.test/missing", { method: "GET" });

    expect(real.calls).toBe(0);
    expect(res.status).toBe(500);
    const msg = await res.text();
    expect(msg).toContain("VCR replay miss");
    expect(msg).toContain("GET https://api.test/missing");
  });

  it("misses (no network) when only the body differs from the recording", async () => {
    const cassette = oneInteraction("POST", "https://api.test", '{"a":1}', "v1");
    const real = stubFetch();
    const vcr = makeVcrFetch({ mode: "replay", cassette, realFetch: real.fn });

    const res = await vcr("https://api.test", { method: "POST", body: '{"a":2}' });

    expect(real.calls).toBe(0);
    expect(res.status).toBe(500);
  });

  it("matches a URL object and a Request object input", async () => {
    const cassette = oneInteraction("GET", "https://api.test/x", "", "url-ok");
    const real = stubFetch();
    const vcr = makeVcrFetch({ mode: "replay", cassette, realFetch: real.fn });

    const viaUrl = await vcr(new URL("https://api.test/x"));
    const viaRequest = await vcr(new Request("https://api.test/x"));

    expect(real.calls).toBe(0);
    expect(await viaUrl.text()).toBe("url-ok");
    expect(await viaRequest.text()).toBe("url-ok");
  });
});
