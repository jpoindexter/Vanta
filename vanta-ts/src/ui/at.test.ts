import { describe, it, expect } from "vitest";
import { matchAtFiles, completeAtRef, activeAtRef } from "./at.js";

const FILES = ["src/app.ts", "src/composer.tsx", "docs/readme.md"];

describe("matchAtFiles", () => {
  it("filters by substring (case-insensitive)", () => {
    expect(matchAtFiles(FILES, "comp")).toEqual(["src/composer.tsx"]);
    expect(matchAtFiles(FILES, "SRC")).toEqual(["src/app.ts", "src/composer.tsx"]);
  });
  it("returns the head of the list for an empty partial, capped", () => {
    expect(matchAtFiles(FILES, "")).toEqual(FILES);
    expect(matchAtFiles(Array.from({ length: 20 }, (_, i) => `f${i}`), "f").length).toBe(8);
  });
});

describe("completeAtRef", () => {
  it("replaces the trailing @partial with the selected file", () => {
    expect(completeAtRef("tell me about @comp", ["src/composer.tsx"], 0)).toBe("tell me about @src/composer.tsx");
  });
  it("fills a bare @ with the first match", () => {
    expect(completeAtRef("look @", FILES, 0)).toBe("look @src/app.ts");
  });
});

describe("activeAtRef (re-exported)", () => {
  it("reads the partial after the last @", () => {
    expect(activeAtRef("about @src/ap")).toBe("src/ap");
    expect(activeAtRef("no mention here")).toBeNull();
  });
});
