import { describe, it, expect } from "vitest";
import { formatObservations, type CompressedObservation } from "./compress.js";

describe("formatObservations", () => {
  it("returns empty string for empty list", () => {
    expect(formatObservations([])).toBe("");
  });

  it("formats observations with type + importance + facts", () => {
    const obs: CompressedObservation[] = [
      {
        type: "decision",
        title: "Use TypeScript strict mode",
        facts: ["tsc strict=true in tsconfig", "no implicit any"],
        importance: "high",
      },
    ];
    const text = formatObservations(obs);
    expect(text).toContain("DECISION");
    expect(text).toContain("high");
    expect(text).toContain("Use TypeScript strict mode");
    expect(text).toContain("tsc strict=true");
  });

  it("handles multiple observations", () => {
    const obs: CompressedObservation[] = [
      { type: "discovery", title: "DDG blocks scraper IPs", facts: ["403 on every attempt"], importance: "medium" },
      { type: "preference", title: "Prefers short responses", facts: ["said so directly"], importance: "low" },
    ];
    const text = formatObservations(obs);
    expect(text).toContain("DISCOVERY");
    expect(text).toContain("PREFERENCE");
  });
});
