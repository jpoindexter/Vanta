import { describe, it, expect } from "vitest";
import {
  requestKey,
  toRecordedRequest,
  recordInteraction,
  findInteraction,
  loadCassette,
  saveCassette,
  CassetteSchema,
  type Cassette,
  type CassetteFs,
} from "./cassette.js";

/** In-memory injected fs for load/save tests — no real disk. */
function memFs(seed: Record<string, string> = {}): CassetteFs & { files: Map<string, string> } {
  const files = new Map<string, string>(Object.entries(seed));
  return {
    files,
    async read(path) {
      const v = files.get(path);
      if (v === undefined) throw new Error(`no such file: ${path}`);
      return v;
    },
    async write(path, data) {
      files.set(path, data);
    },
    async exists(path) {
      return files.has(path);
    },
  };
}

describe("requestKey", () => {
  it("is stable: same inputs produce the same key", () => {
    const a = requestKey("POST", "https://api.test/v1", '{"a":1}');
    const b = requestKey("POST", "https://api.test/v1", '{"a":1}');
    expect(a).toBe(b);
  });

  it("is body-sensitive: a different body yields a different key", () => {
    const a = requestKey("POST", "https://api.test/v1", '{"a":1}');
    const b = requestKey("POST", "https://api.test/v1", '{"a":2}');
    expect(a).not.toBe(b);
  });

  it("normalizes method case so get and GET match", () => {
    expect(requestKey("get", "https://api.test", "")).toBe(
      requestKey("GET", "https://api.test", ""),
    );
  });

  it("distinguishes url and method", () => {
    const base = requestKey("GET", "https://api.test/a", "");
    expect(requestKey("GET", "https://api.test/b", "")).not.toBe(base);
    expect(requestKey("POST", "https://api.test/a", "")).not.toBe(base);
  });

  it("does not leak the raw body (hashes it)", () => {
    const secret = "super-secret-token-value";
    const key = requestKey("POST", "https://api.test", secret);
    expect(key).not.toContain(secret);
  });
});

describe("recordInteraction", () => {
  it("appends without mutating the input cassette", () => {
    const before: Cassette = [];
    const req = toRecordedRequest("GET", "https://api.test", "");
    const after = recordInteraction(before, req, { status: 200, body: "ok" });
    expect(before).toHaveLength(0); // input untouched
    expect(after).toHaveLength(1);
    expect(after[0]).toEqual({ request: req, response: { status: 200, body: "ok" } });
  });

  it("appends in order across multiple records", () => {
    let cassette: Cassette = [];
    cassette = recordInteraction(cassette, toRecordedRequest("GET", "u1", ""), { status: 200, body: "1" });
    cassette = recordInteraction(cassette, toRecordedRequest("GET", "u2", ""), { status: 201, body: "2" });
    expect(cassette.map((i) => i.response.body)).toEqual(["1", "2"]);
  });
});

describe("findInteraction", () => {
  it("returns the recorded response for a matching request", () => {
    const req = toRecordedRequest("POST", "https://api.test", '{"q":"hi"}');
    const cassette = recordInteraction([], req, { status: 200, body: "matched" });
    const lookup = toRecordedRequest("post", "https://api.test", '{"q":"hi"}'); // case-insensitive method
    const hit = findInteraction(cassette, lookup);
    expect(hit).toEqual({ status: 200, body: "matched" });
  });

  it("returns null when no request matches", () => {
    const cassette = recordInteraction(
      [],
      toRecordedRequest("GET", "https://api.test/a", ""),
      { status: 200, body: "a" },
    );
    const miss = findInteraction(cassette, toRecordedRequest("GET", "https://api.test/b", ""));
    expect(miss).toBeNull();
  });

  it("misses when only the body differs", () => {
    const cassette = recordInteraction(
      [],
      toRecordedRequest("POST", "https://api.test", '{"a":1}'),
      { status: 200, body: "v1" },
    );
    const miss = findInteraction(cassette, toRecordedRequest("POST", "https://api.test", '{"a":2}'));
    expect(miss).toBeNull();
  });

  it("returns the first matching interaction when duplicates exist", () => {
    const req = toRecordedRequest("GET", "https://api.test", "");
    let cassette = recordInteraction([], req, { status: 200, body: "first" });
    cassette = recordInteraction(cassette, req, { status: 200, body: "second" });
    expect(findInteraction(cassette, req)?.body).toBe("first");
  });
});

describe("loadCassette / saveCassette", () => {
  const PATH = "/cassettes/test.json";

  it("returns an empty cassette when the file is absent", async () => {
    const fs = memFs();
    expect(await loadCassette(fs, PATH)).toEqual([]);
  });

  it("round-trips a saved cassette through injected fs", async () => {
    const fs = memFs();
    const cassette = recordInteraction(
      [],
      toRecordedRequest("GET", "https://api.test", ""),
      { status: 200, body: "ok" },
    );
    await saveCassette(fs, PATH, cassette);
    const loaded = await loadCassette(fs, PATH);
    expect(loaded).toEqual(cassette);
    // persisted as valid schema-shaped JSON
    expect(CassetteSchema.safeParse(JSON.parse(fs.files.get(PATH)!)).success).toBe(true);
  });

  it("returns an empty cassette on corrupt JSON (tolerant reader, never throws)", async () => {
    const fs = memFs({ [PATH]: "{not json" });
    expect(await loadCassette(fs, PATH)).toEqual([]);
  });

  it("returns an empty cassette on schema-invalid content", async () => {
    const fs = memFs({ [PATH]: JSON.stringify([{ nope: true }]) });
    expect(await loadCassette(fs, PATH)).toEqual([]);
  });
});
