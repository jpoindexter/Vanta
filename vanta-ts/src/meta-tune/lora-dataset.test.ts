import { describe, expect, it } from "vitest";
import {
  buildDpoPairs,
  controlStrip,
  datasetReadiness,
  formatDatasetStats,
  loraTuneEnabled,
  signalToRow,
  type PreferenceRow,
} from "./lora-dataset.js";
import type { PreferenceSignal } from "../preferences/signals.js";

function row(chosen: string, rejected: string, prompt?: string): PreferenceRow {
  return { prompt, chosen, rejected };
}

describe("controlStrip", () => {
  it("removes C0 control bytes and collapses whitespace", () => {
    const dirty = `keep${String.fromCharCode(0)}me${String.fromCharCode(7)}  here`;
    expect(controlStrip(dirty)).toBe("keep me here");
  });

  it("trims surrounding whitespace", () => {
    expect(controlStrip("  padded  ")).toBe("padded");
  });
});

describe("signalToRow", () => {
  it("maps a stored preference signal to context/chosen.value/rejected.value", () => {
    const signal: PreferenceSignal = {
      id: "1",
      timestamp: "2026-06-21T00:00:00.000Z",
      kind: "approval_decision",
      context: "deploy to prod",
      chosen: { label: "deny", value: "deny" },
      rejected: { label: "allow", value: "allow" },
      provenance: { source: "human_approval" },
    };
    expect(signalToRow(signal)).toEqual({ prompt: "deploy to prod", chosen: "deny", rejected: "allow" });
  });
});

describe("buildDpoPairs", () => {
  it("maps a valid row to a {prompt, chosen, rejected} pair", () => {
    const pairs = buildDpoPairs([row("good answer", "bad answer", "the question")]);
    expect(pairs).toEqual([{ prompt: "the question", chosen: "good answer", rejected: "bad answer" }]);
  });

  it("defaults a missing prompt to an empty string", () => {
    const pairs = buildDpoPairs([row("yes", "no")]);
    expect(pairs).toEqual([{ prompt: "", chosen: "yes", rejected: "no" }]);
  });

  it("drops a row with an empty chosen field", () => {
    expect(buildDpoPairs([row("", "no")])).toEqual([]);
  });

  it("drops a row with an empty rejected field", () => {
    expect(buildDpoPairs([row("yes", "")])).toEqual([]);
  });

  it("drops a row that is empty after control-stripping", () => {
    const onlyControl = String.fromCharCode(0) + String.fromCharCode(9) + " ";
    expect(buildDpoPairs([row(onlyControl, "no")])).toEqual([]);
  });

  it("drops a degenerate row where chosen === rejected", () => {
    expect(buildDpoPairs([row("same", "same")])).toEqual([]);
  });

  it("treats rows as degenerate after stripping makes them equal", () => {
    const a = `same${String.fromCharCode(0)}`;
    const b = "same";
    expect(buildDpoPairs([row(a, b)])).toEqual([]);
  });

  it("drops a duplicate pair already seen", () => {
    const pairs = buildDpoPairs([
      row("a", "b", "q"),
      row("a", "b", "q"),
      row("c", "d", "q"),
    ]);
    expect(pairs).toEqual([
      { prompt: "q", chosen: "a", rejected: "b" },
      { prompt: "q", chosen: "c", rejected: "d" },
    ]);
  });

  it("control-strips the text fields in the output pair", () => {
    const dirty = `clean${String.fromCharCode(0)}choice`;
    const pairs = buildDpoPairs([row(dirty, "other")]);
    expect(pairs).toEqual([{ prompt: "", chosen: "clean choice", rejected: "other" }]);
  });

  it("returns no pairs for empty input", () => {
    expect(buildDpoPairs([])).toEqual([]);
  });
});

describe("datasetReadiness", () => {
  function pairs(n: number) {
    return Array.from({ length: n }, (_, i) => ({ prompt: `q${i}`, chosen: `c${i}`, rejected: `r${i}` }));
  }

  it("is ready when usablePairs >= minPairs", () => {
    const r = datasetReadiness(pairs(20));
    expect(r.ready).toBe(true);
    expect(r.usablePairs).toBe(20);
  });

  it("is not ready below the default minimum and reports how many more are needed", () => {
    const r = datasetReadiness(pairs(5));
    expect(r.ready).toBe(false);
    expect(r.usablePairs).toBe(5);
    expect(r.reason).toContain("need 15 more pairs");
  });

  it("respects a custom minPairs", () => {
    expect(datasetReadiness(pairs(3), 3).ready).toBe(true);
    expect(datasetReadiness(pairs(2), 3).reason).toContain("need 1 more pair");
  });

  it("reports not-ready with zero usable pairs for an empty dataset", () => {
    const r = datasetReadiness([]);
    expect(r.ready).toBe(false);
    expect(r.usablePairs).toBe(0);
    expect(r.reason).toContain("need 20 more pairs");
  });
});

describe("formatDatasetStats", () => {
  it("renders a readable summary with counts and readiness", () => {
    const out = formatDatasetStats([
      { prompt: "q", chosen: "a", rejected: "b" },
      { prompt: "", chosen: "c", rejected: "d" },
    ]);
    expect(out).toContain("2 usable pairs");
    expect(out).toContain("prompted: 1");
    expect(out).toContain("unconditioned: 1");
    expect(out).toContain("not ready");
  });

  it("uses singular wording for one pair", () => {
    const out = formatDatasetStats([{ prompt: "q", chosen: "a", rejected: "b" }]);
    expect(out).toContain("1 usable pair");
    expect(out).not.toContain("1 usable pairs");
  });
});

describe("loraTuneEnabled", () => {
  it("is off by default", () => {
    expect(loraTuneEnabled({})).toBe(false);
  });

  it("is on only when VANTA_LORA_TUNE=1", () => {
    expect(loraTuneEnabled({ VANTA_LORA_TUNE: "1" })).toBe(true);
    expect(loraTuneEnabled({ VANTA_LORA_TUNE: "0" })).toBe(false);
    expect(loraTuneEnabled({ VANTA_LORA_TUNE: "true" })).toBe(false);
  });
});
