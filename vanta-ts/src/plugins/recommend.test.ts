import { describe, it, expect } from "vitest";
import {
  LANGUAGE_PLUGIN_MAP,
  DEFAULT_RECOMMEND_OPTIONS,
  recommendPlugins,
  formatRecommendations,
  type RecommendSignals,
} from "./recommend.js";

/** A fully-empty signal bag — the "no signals" baseline. */
function emptySignals(): RecommendSignals {
  return { fileExtCounts: {}, hintPluginNames: [] };
}

describe("LANGUAGE_PLUGIN_MAP", () => {
  it("maps the named languages to their LSP plugins", () => {
    expect(LANGUAGE_PLUGIN_MAP[".rs"]).toBe("rust-analyzer-lsp");
    expect(LANGUAGE_PLUGIN_MAP[".py"]).toBe("pyright-lsp");
    expect(LANGUAGE_PLUGIN_MAP[".go"]).toBe("gopls-lsp");
    expect(LANGUAGE_PLUGIN_MAP[".ts"]).toBe("typescript-lsp");
  });
});

describe("recommendPlugins — language lane", () => {
  it("recommends an ext-heavy project's LSP plugin above the threshold", () => {
    const recs = recommendPlugins({
      fileExtCounts: { ".rs": 40 },
      hintPluginNames: [],
    });
    expect(recs).toHaveLength(1);
    expect(recs[0]?.plugin).toBe("rust-analyzer-lsp");
    expect(recs[0]?.score).toBe(40);
  });

  it("does NOT recommend a language whose ext count is below threshold", () => {
    // languageThreshold default is 3; 2 .rs files is below it
    const recs = recommendPlugins({
      fileExtCounts: { ".rs": 2 },
      hintPluginNames: [],
    });
    expect(recs).toEqual([]);
  });

  it("recommends exactly at the threshold (>=)", () => {
    const recs = recommendPlugins({
      fileExtCounts: { ".py": DEFAULT_RECOMMEND_OPTIONS.languageThreshold },
      hintPluginNames: [],
    });
    expect(recs.map((r) => r.plugin)).toEqual(["pyright-lsp"]);
  });

  it("sums extensions that share one plugin (.ts + .tsx -> typescript-lsp)", () => {
    const recs = recommendPlugins({
      fileExtCounts: { ".ts": 2, ".tsx": 2 },
      hintPluginNames: [],
    });
    // each alone is below threshold(3); summed 4 is over
    expect(recs).toHaveLength(1);
    expect(recs[0]?.plugin).toBe("typescript-lsp");
    expect(recs[0]?.score).toBe(4);
  });

  it("ignores unknown extensions and non-positive counts", () => {
    const recs = recommendPlugins({
      fileExtCounts: { ".unknownext": 99, ".rs": 0 },
      hintPluginNames: [],
    });
    expect(recs).toEqual([]);
  });

  it("matches extensions case-insensitively", () => {
    const recs = recommendPlugins({
      fileExtCounts: { ".RS": 5 },
      hintPluginNames: [],
    });
    expect(recs.map((r) => r.plugin)).toEqual(["rust-analyzer-lsp"]);
  });
});

describe("recommendPlugins — hint lane", () => {
  it("recommends a hint-named plugin with a high score and 'requested' reason", () => {
    const recs = recommendPlugins({
      fileExtCounts: {},
      hintPluginNames: ["some-cool-plugin"],
    });
    expect(recs).toHaveLength(1);
    expect(recs[0]?.plugin).toBe("some-cool-plugin");
    expect(recs[0]?.score).toBe(DEFAULT_RECOMMEND_OPTIONS.hintScore);
    expect(recs[0]?.reason).toContain("explicitly requested");
  });

  it("drops an unsafe hint plugin name (reuses the safe-name check)", () => {
    const recs = recommendPlugins({
      fileExtCounts: {},
      hintPluginNames: ["evil; rm -rf /", "../../etc/passwd", "ok-plugin"],
    });
    expect(recs.map((r) => r.plugin)).toEqual(["ok-plugin"]);
  });
});

describe("recommendPlugins — capability lane", () => {
  it("recommends a plugin for a repeatedly-failing capability", () => {
    const recs = recommendPlugins({
      fileExtCounts: {},
      hintPluginNames: [],
      failingCapabilities: ["lint"],
    });
    expect(recs).toHaveLength(1);
    expect(recs[0]?.plugin).toBe("eslint-lint");
    expect(recs[0]?.score).toBe(DEFAULT_RECOMMEND_OPTIONS.capabilityScore);
    expect(recs[0]?.reason).toContain("keeps failing");
  });

  it("ignores an unknown failing capability", () => {
    const recs = recommendPlugins({
      fileExtCounts: {},
      hintPluginNames: [],
      failingCapabilities: ["telepathy"],
    });
    expect(recs).toEqual([]);
  });
});

describe("recommendPlugins — dedupe + ranking", () => {
  it("dedupes by plugin name keeping the highest score", () => {
    // typescript-lsp arrives from BOTH the hint lane (100) and the language
    // lane (5); the deduped result keeps the high score + hint reason.
    const recs = recommendPlugins({
      fileExtCounts: { ".ts": 5 },
      hintPluginNames: ["typescript-lsp"],
    });
    expect(recs).toHaveLength(1);
    expect(recs[0]?.plugin).toBe("typescript-lsp");
    expect(recs[0]?.score).toBe(DEFAULT_RECOMMEND_OPTIONS.hintScore);
    expect(recs[0]?.reason).toContain("explicitly requested");
  });

  it("ranks recommendations by score descending", () => {
    const recs = recommendPlugins({
      fileExtCounts: { ".rs": 40 }, // language: score 40
      hintPluginNames: ["a-plugin"], // hint: score 100
      failingCapabilities: ["test"], // capability: score 50
    });
    expect(recs.map((r) => r.plugin)).toEqual([
      "a-plugin", // 100
      "vitest-runner", // 50
      "rust-analyzer-lsp", // 40
    ]);
    const scores = recs.map((r) => r.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it("breaks score ties stably by plugin name", () => {
    const recs = recommendPlugins({
      fileExtCounts: { ".rs": 10, ".go": 10 },
      hintPluginNames: [],
    });
    // equal scores (10 each) -> alphabetical: gopls-lsp before rust-analyzer-lsp
    expect(recs.map((r) => r.plugin)).toEqual([
      "gopls-lsp",
      "rust-analyzer-lsp",
    ]);
  });

  it("caps the number of recommendations", () => {
    const recs = recommendPlugins(
      {
        fileExtCounts: { ".rs": 9, ".py": 8, ".go": 7, ".ts": 6, ".rb": 5, ".java": 4 },
        hintPluginNames: [],
      },
      { ...DEFAULT_RECOMMEND_OPTIONS, cap: 3 },
    );
    expect(recs).toHaveLength(3);
    // highest-count langs survive the cap
    expect(recs.map((r) => r.plugin)).toEqual([
      "rust-analyzer-lsp", // 9
      "pyright-lsp", // 8
      "gopls-lsp", // 7
    ]);
  });
});

describe("recommendPlugins — no signals", () => {
  it("returns [] for an empty signal bag", () => {
    expect(recommendPlugins(emptySignals())).toEqual([]);
  });

  it("returns [] when no signal maps or clears its threshold", () => {
    const recs = recommendPlugins({
      fileExtCounts: { ".md": 100, ".rs": 1 },
      hintPluginNames: [],
      failingCapabilities: ["unknown"],
    });
    expect(recs).toEqual([]);
  });

  it("never installs — it is a pure function returning a list", () => {
    const signals: RecommendSignals = {
      fileExtCounts: { ".rs": 40 },
      hintPluginNames: [],
    };
    const a = recommendPlugins(signals);
    const b = recommendPlugins(signals);
    expect(a).toEqual(b); // deterministic, no side effects
    expect(signals.fileExtCounts).toEqual({ ".rs": 40 }); // input untouched
  });
});

describe("formatRecommendations", () => {
  it("renders an install line (via buildPluginSuggestion) + the reason", () => {
    const block = formatRecommendations([
      { plugin: "rust-analyzer-lsp", reason: "project has 40 matching files", score: 40 },
    ]);
    expect(block).toContain("rust-analyzer-lsp");
    expect(block).toContain("vanta plugins add rust-analyzer-lsp");
    expect(block).toContain("project has 40 matching files");
  });

  it("renders multiple recommendations, one suggestion per recommendation", () => {
    const block = formatRecommendations([
      { plugin: "a-plugin", reason: "r1", score: 100 },
      { plugin: "b-plugin", reason: "r2", score: 50 },
    ]);
    expect(block).toContain("vanta plugins add a-plugin");
    expect(block).toContain("vanta plugins add b-plugin");
    expect(block).toContain("r1");
    expect(block).toContain("r2");
  });

  it("skips a recommendation with an unsafe plugin name (defense in depth)", () => {
    const block = formatRecommendations([
      { plugin: "good-plugin", reason: "r1", score: 100 },
      { plugin: "bad name; rm", reason: "r2", score: 50 },
    ]);
    expect(block).toContain("good-plugin");
    expect(block).not.toContain("rm");
  });

  it("returns '' for no recommendations", () => {
    expect(formatRecommendations([])).toBe("");
  });

  it("formats the full pipeline output from recommendPlugins", () => {
    const recs = recommendPlugins({
      fileExtCounts: { ".py": 12 },
      hintPluginNames: [],
    });
    const block = formatRecommendations(recs);
    expect(block).toContain("pyright-lsp");
    expect(block).toContain("vanta plugins add pyright-lsp");
  });
});
