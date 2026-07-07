import { describe, it, expect } from "vitest";
import { formatRecap, rankSuggestions, formatSuggestions, buildSuggestView, resumeRecap } from "./suggestions.js";

// VANTA-SUGGESTIONS — recap + deterministic ranked next-step.

describe("formatRecap", () => {
  it("shows done / in-progress / next with real content", () => {
    const r = formatRecap({ doneRecent: ["shipped BM25"], inProgress: ["wire keybindings"], next: "finish vim operators" });
    expect(r).toContain("shipped BM25");
    expect(r).toContain("wire keybindings");
    expect(r).toContain("Next: finish vim operators");
  });
  it("uses empty-state text when a section is empty", () => {
    const r = formatRecap({ doneRecent: [], inProgress: [], next: null });
    expect(r).toContain("nothing recorded");
    expect(r).toContain("nothing open");
    expect(r).toContain("no active goal");
  });
  it("caps each section at 3 items", () => {
    const r = formatRecap({ doneRecent: ["a", "b", "c", "d"], inProgress: [], next: null });
    expect(r).not.toContain("· d");
  });
});

describe("rankSuggestions", () => {
  it("prioritizes finishing in-progress work over starting backlog", () => {
    const s = rankSuggestions({ inProgress: ["auth refactor"], backlog: [{ id: "X1", title: "add logging", size: "S" }], activeGoals: ["auth refactor"] });
    expect(s[0]!.kind).toBe("resume");
    expect(s[0]!.text).toContain("auth refactor");
  });
  it("ships the smallest backlog item first (pebble-first)", () => {
    const s = rankSuggestions({ inProgress: [], backlog: [{ id: "L1", title: "big", size: "L" }, { id: "S1", title: "small", size: "S" }], activeGoals: [] });
    expect(s[0]!.text).toContain("[S1]");
  });
  it("suggests advancing a goal only when nothing is in progress", () => {
    const withWip = rankSuggestions({ inProgress: ["wip"], backlog: [], activeGoals: ["goal A"] });
    expect(withWip.some((x) => x.kind === "goal")).toBe(false);
    const idle = rankSuggestions({ inProgress: [], backlog: [], activeGoals: ["goal A"] });
    expect(idle[0]!.kind).toBe("goal");
  });
  it("caps at 3 suggestions", () => {
    const s = rankSuggestions({ inProgress: ["a", "b", "c", "d"], backlog: [], activeGoals: [] });
    expect(s).toHaveLength(3);
  });
});

describe("formatSuggestions / buildSuggestView", () => {
  it("renders numbered suggestions with reasons", () => {
    const out = formatSuggestions(rankSuggestions({ inProgress: [], backlog: [{ id: "S1", title: "small", size: "S" }], activeGoals: [] }));
    expect(out).toContain("1. Ship [S1] small");
    expect(out).toContain("↳");
  });
  it("empty state is explicit, not blank", () => {
    expect(formatSuggestions([])).toContain("No suggestions");
  });
  it("buildSuggestView combines the recap and the ranked list", () => {
    const view = buildSuggestView({ done: ["shipped X"], active: ["goal A"], backlog: [{ id: "S1", title: "small", size: "S" }] });
    expect(view).toContain("Recap — where you left off");
    expect(view).toContain("Suggested next steps:");
    expect(view).toContain("goal A"); // active goal is in-progress → first suggestion
  });
});

describe("resumeRecap (auto-shown on resume)", () => {
  it("builds a recap from injected goals (done/active) with no backlog file", async () => {
    const getGoals = async () => [
      { status: "done", text: "shipped BM25" },
      { status: "active", text: "keybindings" },
    ];
    const r = await resumeRecap({ getGoals, dataDir: "/nonexistent/.vanta" });
    expect(r).toContain("Recap — where you left off");
    expect(r).toContain("shipped BM25");
    expect(r).toContain("keybindings");
  });
  it("never throws when getGoals fails (best-effort resume)", async () => {
    const r = await resumeRecap({ getGoals: async () => { throw new Error("kernel down"); }, dataDir: "/x/.vanta" });
    expect(r).toContain("Recap"); // degrades to empty sections, still renders
  });
});
