import { describe, expect, it } from "vitest";
import { surfacePresentation } from "./desktop-surface.js";

describe("same-workspace presentation", () => {
  it("mini reveals the chat instead of hiding it behind the narrow sidebar", () => {
    expect(surfacePresentation("mini", { view: "connect", sidebar: true, inspector: true }))
      .toEqual({ view: "work", sidebar: false, inspector: false });
  });
  it("full returns to the previous destination and panels without changing session or draft", () => {
    const saved = { view: "outputs" as const, sidebar: false, inspector: true };
    expect(surfacePresentation("full", saved)).toEqual(saved);
    expect(Object.keys(surfacePresentation("mini", saved)).sort()).toEqual(["inspector", "sidebar", "view"]);
  });
});
