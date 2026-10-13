import { describe, expect, it } from "vitest";
import { hasPromptMap } from "./prompt-map.js";

describe("hasPromptMap", () => {
  it("hides the map for a single prompt, which has nothing to jump between", () => {
    expect(hasPromptMap([{ role: "user", content: "Review the roadmap" }, { role: "assistant", content: "Done." }])).toBe(false);
  });

  it("ignores blank prompts when counting", () => {
    expect(hasPromptMap([{ role: "user", content: "One" }, { role: "user", content: "   " }])).toBe(false);
  });

  it("shows the map once there are two real prompts", () => {
    expect(hasPromptMap([{ role: "user", content: "One" }, { role: "assistant", content: "Ok" }, { role: "user", content: "Two" }])).toBe(true);
  });
});
