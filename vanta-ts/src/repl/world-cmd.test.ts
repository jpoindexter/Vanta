import { describe, it, expect } from "vitest";
import { formatWorld } from "./world-cmd.js";
import type { WorldRecord } from "../world/store.js";

const recs: WorldRecord[] = [
  { kind: "entity", id: "indx", type: "project", name: "Indx", note: "second brain", ts: "t1" },
  { kind: "relation", from: "jason", to: "indx", rel: "owns", ts: "t2" },
];

describe("formatWorld", () => {
  it("summarizes entities + relations and lists matches", () => {
    const out = formatWorld(recs, "");
    expect(out).toContain("1 entity · 1 relation");
    expect(out).toContain("project:indx — Indx · second brain");
  });

  it("an empty world prompts to record", () => {
    expect(formatWorld([], "")).toContain("empty");
  });

  it("a non-matching query says so", () => {
    expect(formatWorld(recs, "zzz")).toContain('no entities match "zzz"');
  });
});
