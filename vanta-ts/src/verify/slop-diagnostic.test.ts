import { describe, it, expect } from "vitest";
import {
  hedgeDensity,
  fillerDensity,
  buzzwordDensity,
  lacksSpecifics,
  restatesPrompt,
  runSlopDiagnostic,
  formatSlopReport,
} from "./slop-diagnostic.js";

// A substantive sentence: concrete, specific, no hedging/filler/buzzwords.
const SUBSTANTIVE =
  "The API returns 200 in 50ms from server.ts after the cache warms on boot.";

// A slop sentence: hedge + filler + buzzword + restating + vague.
const SLOP =
  "It's important to note that we might generally leverage synergy to deliver " +
  "a robust, seamless, holistic, cutting-edge paradigm, and arguably it depends " +
  "and in some cases perhaps it more or less works out.";

describe("hedgeDensity", () => {
  it("returns low for a clean sentence", () => {
    expect(hedgeDensity(SUBSTANTIVE)).toBeLessThan(0.05);
  });

  it("returns high for a hedge-heavy sentence", () => {
    const text = "It might perhaps generally work, and arguably it depends.";
    expect(hedgeDensity(text)).toBeGreaterThan(0.2);
  });

  it("returns 0 for empty text", () => {
    expect(hedgeDensity("")).toBe(0);
  });
});

describe("fillerDensity", () => {
  it("returns low for a clean sentence", () => {
    expect(fillerDensity(SUBSTANTIVE)).toBeLessThan(0.05);
  });

  it("returns high for a filler-heavy sentence", () => {
    const text =
      "It's important to note that at the end of the day, when it comes to it, " +
      "needless to say.";
    expect(fillerDensity(text)).toBeGreaterThan(0.1);
  });

  it("returns 0 for empty text", () => {
    expect(fillerDensity("")).toBe(0);
  });
});

describe("buzzwordDensity", () => {
  it("returns low for a clean sentence", () => {
    expect(buzzwordDensity(SUBSTANTIVE)).toBeLessThan(0.05);
  });

  it("returns high for a buzzword-heavy sentence", () => {
    const text = "Leverage synergy for a robust, seamless, holistic paradigm.";
    expect(buzzwordDensity(text)).toBeGreaterThan(0.2);
  });

  it("returns 0 for empty text", () => {
    expect(buzzwordDensity("")).toBe(0);
  });
});

describe("lacksSpecifics", () => {
  it("is false when the text has numbers, names, and file/code tokens", () => {
    expect(lacksSpecifics("the API returns 200 in 50ms from server.ts")).toBe(false);
  });

  it("is true for vague text with no specifics", () => {
    expect(lacksSpecifics("it generally depends on various factors")).toBe(true);
  });

  it("is false when only a number is present", () => {
    expect(lacksSpecifics("we shipped 3 of them")).toBe(false);
  });

  it("is false when only a proper noun is present", () => {
    expect(lacksSpecifics("we deployed it with Docker today")).toBe(false);
  });

  it("is true for empty text", () => {
    expect(lacksSpecifics("")).toBe(true);
  });
});

describe("restatesPrompt", () => {
  it("is high when the answer echoes the prompt", () => {
    const prompt = "How do we improve onboarding conversion for new users?";
    const answer = "We improve onboarding conversion for new users by onboarding users.";
    expect(restatesPrompt(answer, prompt)).toBeGreaterThan(0.6);
  });

  it("is low when the answer adds novel tokens", () => {
    const prompt = "How do we improve onboarding conversion?";
    const answer = "Cut the signup form to 50ms server.ts roundtrips and remove step 3.";
    expect(restatesPrompt(answer, prompt)).toBeLessThan(0.4);
  });

  it("returns 0 when no prompt is given", () => {
    expect(restatesPrompt("any answer at all")).toBe(0);
  });

  it("returns 0 for empty answer", () => {
    expect(restatesPrompt("", "some prompt here")).toBe(0);
  });
});

describe("runSlopDiagnostic", () => {
  it("scores substantive text as low slop and not slop", () => {
    const result = runSlopDiagnostic(SUBSTANTIVE, "make the API fast");
    expect(result.isSlop).toBe(false);
    expect(result.slopScore).toBeLessThan(0.34);
    expect(result.tests.filter((t) => t.failed).length).toBeLessThan(3);
  });

  it("scores slop text as high slop, isSlop true, with the failed test ids", () => {
    const result = runSlopDiagnostic(SLOP, "should we leverage synergy");
    expect(result.isSlop).toBe(true);
    expect(result.slopScore).toBeGreaterThan(0.34);
    const failed = result.tests.filter((t) => t.failed).map((t) => t.id);
    expect(failed.length).toBeGreaterThanOrEqual(3);
    expect(failed).toContain("hedge");
    expect(failed).toContain("buzzword");
  });

  it("returns 5 tests with stable ids", () => {
    const result = runSlopDiagnostic(SUBSTANTIVE);
    expect(result.tests.map((t) => t.id)).toEqual([
      "hedge",
      "filler",
      "no-specifics",
      "restates-prompt",
      "buzzword",
    ]);
  });

  it("treats empty text as maximum slop with all tests failed", () => {
    const result = runSlopDiagnostic("");
    expect(result.isSlop).toBe(true);
    expect(result.slopScore).toBe(1);
    expect(result.tests.every((t) => t.failed)).toBe(true);
  });
});

describe("formatSlopReport", () => {
  it("is readable and lists failed ids for slop", () => {
    const result = runSlopDiagnostic(SLOP, "should we leverage synergy");
    const report = formatSlopReport(result);
    expect(report).toMatch(/^slop \d+% — failed: /);
    expect(report).toContain("hedge");
  });

  it("reports clean for substantive text", () => {
    const result = runSlopDiagnostic(SUBSTANTIVE, "make the API fast");
    const report = formatSlopReport(result);
    expect(report).toMatch(/^slop \d+% — clean$/);
  });
});
