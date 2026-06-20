import { describe, expect, it } from "vitest";
import {
  DEFAULT_PASTE_THRESHOLD,
  buildPasteReference,
  isLargePaste,
  offloadLargePaste,
  resolvePasteThreshold,
  retrievePaste,
  type PasteStore,
} from "./paste-store.js";

/** In-memory fake of the CCR-style store — no disk, fully injected. */
function fakeStore(): PasteStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    async stash(id, text) {
      map.set(id, text);
    },
    async retrieve(id) {
      return map.get(id) ?? null;
    },
  };
}

/** A store whose stash always rejects, to exercise the inline-fallback path. */
function failingStore(): PasteStore {
  return {
    async stash() {
      throw new Error("disk full");
    },
    async retrieve() {
      throw new Error("disk full");
    },
  };
}

const big = "x".repeat(DEFAULT_PASTE_THRESHOLD + 1);
const small = "a normal short message";

describe("resolvePasteThreshold", () => {
  it("uses the default when nothing is provided", () => {
    expect(resolvePasteThreshold(undefined, {})).toBe(DEFAULT_PASTE_THRESHOLD);
  });

  it("prefers an explicit override over the env var", () => {
    expect(resolvePasteThreshold(50, { VANTA_PASTE_THRESHOLD: "999" })).toBe(50);
  });

  it("reads VANTA_PASTE_THRESHOLD when no override is given", () => {
    expect(resolvePasteThreshold(undefined, { VANTA_PASTE_THRESHOLD: "120" })).toBe(120);
  });

  it("ignores a non-positive or unparseable env value", () => {
    expect(resolvePasteThreshold(undefined, { VANTA_PASTE_THRESHOLD: "0" })).toBe(
      DEFAULT_PASTE_THRESHOLD,
    );
    expect(resolvePasteThreshold(undefined, { VANTA_PASTE_THRESHOLD: "nope" })).toBe(
      DEFAULT_PASTE_THRESHOLD,
    );
  });
});

describe("isLargePaste", () => {
  it("is true at/above the threshold", () => {
    expect(isLargePaste(big, undefined, {})).toBe(true);
    expect(isLargePaste("y".repeat(10), 10, {})).toBe(true);
  });

  it("is false below the threshold", () => {
    expect(isLargePaste(small, undefined, {})).toBe(false);
  });

  it("honors an env-supplied threshold", () => {
    expect(isLargePaste("abcdef", undefined, { VANTA_PASTE_THRESHOLD: "5" })).toBe(true);
    expect(isLargePaste("abc", undefined, { VANTA_PASTE_THRESHOLD: "5" })).toBe(false);
  });
});

describe("buildPasteReference", () => {
  it("contains the id, exact char count, a token estimate, and a head preview", () => {
    const text = `${"HEADWORD ".repeat(40)}${"z".repeat(9_000)}`;
    const ref = buildPasteReference("abc123", text);
    expect(ref).toContain("id abc123");
    expect(ref).toContain(`${text.length} chars`);
    expect(ref).toMatch(/~\d+ tokens/);
    expect(ref).toContain("HEADWORD");
    expect(ref).toContain("…"); // truncated head ellipsis
    expect(ref).toContain("retrieve with the paste id");
  });

  it("omits the ellipsis when the text is shorter than the head window", () => {
    const ref = buildPasteReference("id1", "short");
    expect(ref).toContain("head: short");
    expect(ref).not.toContain("…");
  });
});

describe("offloadLargePaste", () => {
  it("offloads a >threshold paste: stores it and returns a reference with id/size/head", async () => {
    const store = fakeStore();
    const id = "deadbeef01";
    const text = `START_MARKER ${big}`;

    const res = await offloadLargePaste(text, { store, id }, {});

    expect(res.offloaded).toBe(true);
    if (!res.offloaded) throw new Error("expected offloaded");
    expect(res.id).toBe(id);
    expect(res.reference).toContain(`id ${id}`);
    expect(res.reference).toContain(`${text.length} chars`);
    expect(res.reference).toContain("START_MARKER");
    expect(store.map.get(id)).toBe(text); // original persisted verbatim
  });

  it("leaves a normal-sized message unchanged and byte-identical", async () => {
    const store = fakeStore();
    const res = await offloadLargePaste(small, { store, id: "n1" }, {});

    expect(res.offloaded).toBe(false);
    if (res.offloaded) throw new Error("expected not offloaded");
    expect(res.text).toBe(small); // byte-identical
    expect(store.map.size).toBe(0); // nothing stored
  });

  it("respects a per-call threshold override", async () => {
    const store = fakeStore();
    const res = await offloadLargePaste(
      "1234567890",
      { store, id: "t1", thresholdChars: 5 },
      {},
    );
    expect(res.offloaded).toBe(true);
  });

  it("respects an env threshold override", async () => {
    const store = fakeStore();
    const res = await offloadLargePaste(
      "1234567890",
      { store, id: "e1" },
      { VANTA_PASTE_THRESHOLD: "5" },
    );
    expect(res.offloaded).toBe(true);
  });

  it("leaves the text inline (never throws) when the store fails", async () => {
    const res = await offloadLargePaste(big, { store: failingStore(), id: "f1" }, {});
    expect(res.offloaded).toBe(false);
    if (res.offloaded) throw new Error("expected inline fallback");
    expect(res.text).toBe(big); // original preserved inline
  });
});

describe("retrievePaste", () => {
  it("round-trips: offload then retrieve returns the original", async () => {
    const store = fakeStore();
    const id = "round01";
    const text = `ORIGINAL ${big}`;

    await offloadLargePaste(text, { store, id }, {});
    const back = await retrievePaste(id, { store });

    expect(back).toBe(text);
  });

  it("returns null for an unknown id", async () => {
    expect(await retrievePaste("missing", { store: fakeStore() })).toBeNull();
  });

  it("returns null (never throws) when the store fails", async () => {
    expect(await retrievePaste("x", { store: failingStore() })).toBeNull();
  });
});
