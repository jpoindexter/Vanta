import { describe, it, expect, vi, afterEach } from "vitest";
import { cosineSim, embed, embedAvailable } from "./embed.js";

// ---------------------------------------------------------------------------
// cosineSim — pure, no network
// ---------------------------------------------------------------------------

describe("cosineSim", () => {
  it("identical vectors → ~1", () => {
    const v = [1, 0, 0.5];
    expect(cosineSim(v, v)).toBeCloseTo(1, 5);
  });

  it("orthogonal vectors → 0", () => {
    expect(cosineSim([1, 0], [0, 1])).toBeCloseTo(0, 5);
  });

  it("zero vector a → 0", () => {
    expect(cosineSim([0, 0], [1, 2])).toBe(0);
  });

  it("zero vector b → 0", () => {
    expect(cosineSim([1, 2], [0, 0])).toBe(0);
  });

  it("both zero vectors → 0", () => {
    expect(cosineSim([0, 0], [0, 0])).toBe(0);
  });

  it("empty vectors → 0", () => {
    expect(cosineSim([], [])).toBe(0);
  });

  it("mismatched lengths → 0", () => {
    expect(cosineSim([1, 2, 3], [1, 2])).toBe(0);
  });

  it("opposite-direction vectors → -1", () => {
    expect(cosineSim([1, 0], [-1, 0])).toBeCloseTo(-1, 5);
  });
});

// ---------------------------------------------------------------------------
// embed — mocked fetch (no network required)
// ---------------------------------------------------------------------------

const mockEmbedding = [0.1, 0.2, 0.3, 0.4];
const ENV: NodeJS.ProcessEnv = {};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("embed", () => {
  it("returns the embedding vector on a successful response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ embedding: mockEmbedding }),
      }),
    );
    const result = await embed("hello", ENV);
    expect(result).toEqual(mockEmbedding);
  });

  it("returns null when fetch throws (network error / timeout)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    const result = await embed("hello", ENV);
    expect(result).toBeNull();
  });

  it("returns null on non-200 status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({}),
      }),
    );
    const result = await embed("hello", ENV);
    expect(result).toBeNull();
  });

  it("returns null when response shape is invalid (missing embedding field)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ notEmbedding: [1, 2, 3] }),
      }),
    );
    const result = await embed("hello", ENV);
    expect(result).toBeNull();
  });

  it("returns null when response body is not parseable JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => {
          throw new SyntaxError("Unexpected token");
        },
      }),
    );
    const result = await embed("hello", ENV);
    expect(result).toBeNull();
  });

  it("uses VANTA_EMBED_MODEL env var as the model field", async () => {
    const captured: { body?: string }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (_url: unknown, opts: { body?: string }) => {
        captured.push({ body: opts.body });
        return { ok: true, json: async () => ({ embedding: mockEmbedding }) };
      }),
    );
    await embed("hello", { VANTA_EMBED_MODEL: "mxbai-embed-large" });
    const body = JSON.parse(captured[0]?.body ?? "{}") as { model?: string };
    expect(body.model).toBe("mxbai-embed-large");
  });

  it("strips /v1 suffix from VANTA_OLLAMA_URL", async () => {
    const captured: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: unknown) => {
        captured.push(String(url));
        return { ok: true, json: async () => ({ embedding: mockEmbedding }) };
      }),
    );
    await embed("hello", { VANTA_OLLAMA_URL: "http://localhost:11434/v1" });
    expect(captured[0]).toBe("http://localhost:11434/api/embeddings");
  });
});

// ---------------------------------------------------------------------------
// embedAvailable — mocked fetch
// ---------------------------------------------------------------------------

describe("embedAvailable", () => {
  it("returns true when embed returns a non-empty vector", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ embedding: [0.1, 0.2] }),
      }),
    );
    expect(await embedAvailable(ENV)).toBe(true);
  });

  it("returns false when fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    expect(await embedAvailable(ENV)).toBe(false);
  });
});
