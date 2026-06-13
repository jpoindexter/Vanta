import { describe, it, expect } from "vitest";
import { formatLife } from "./lifesearch-cmd.js";
import type { LifeHit } from "../search/life.js";

describe("formatLife", () => {
  it("returns a no-hits line for empty hits array", () => {
    const out = formatLife([], "acme");
    expect(out).toBe('no local hits for "acme"');
  });

  it("returns header + rows for hits", () => {
    const hits: LifeHit[] = [
      { source: "world", snippet: "Bob works at Acme" },
      { source: "money", snippet: "Invoice from Acme" },
    ];
    const out = formatLife(hits, "acme");
    expect(out).toContain('life search: "acme"');
    expect(out).toContain("2 hit(s)");
    expect(out).toContain("world · Bob works at Acme");
    expect(out).toContain("money · Invoice from Acme");
  });

  it("shows singular hit count in header", () => {
    const hits: LifeHit[] = [{ source: "world", snippet: "Alice" }];
    const out = formatLife(hits, "alice");
    expect(out).toContain("1 hit(s)");
  });
});
