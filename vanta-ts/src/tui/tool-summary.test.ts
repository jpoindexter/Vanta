import { describe, it, expect } from "vitest";
import { summarizeGroup } from "./tool-summary.js";

describe("summarizeGroup", () => {
  it("capitalizes the first verb and lowercases the rest", () => {
    const members = [
      { name: "read_file", verb: "read" },
      { name: "list_directory", verb: "listed" },
      { name: "web_search", verb: "searched" },
    ];
    const { verbs } = summarizeGroup(members);
    expect(verbs[0]).toBe("Read");
    expect(verbs[1]).toBe("listed");
    expect(verbs[2]).toBe("searched");
  });

  it("deduplicates repeated verbs", () => {
    const members = [
      { name: "read_file", verb: "read" },
      { name: "read_file", verb: "read" },
      { name: "read_file", verb: "read" },
    ];
    const { verbs } = summarizeGroup(members);
    expect(verbs).toEqual(["Read"]);
  });

  it("counts by category", () => {
    const members = [
      { name: "read_file", verb: "read" },
      { name: "write_file", verb: "wrote" },
      { name: "list_directory", verb: "listed" },
    ];
    const { counts } = summarizeGroup(members);
    expect(counts).toContain("2 files");
    expect(counts).toContain("1 dir");
  });

  it("handles a solo member", () => {
    const { verbs, counts } = summarizeGroup([{ name: "shell_cmd", verb: "ran" }]);
    expect(verbs).toEqual(["Ran"]);
    expect(counts).toBe("1 shell");
  });

  it("uses 'op' fallback for unknown tool names", () => {
    const { counts } = summarizeGroup([{ name: "unknown_tool", verb: "did" }]);
    expect(counts).toBe("1 op");
  });

  it("pluralizes counts correctly", () => {
    const members = [
      { name: "read_file", verb: "read" },
      { name: "read_file", verb: "read" },
    ];
    const { counts } = summarizeGroup(members);
    expect(counts).toBe("2 files");
  });

  it("uses irregular plural for memory", () => {
    const members = [
      { name: "brain", verb: "remembered" },
      { name: "recall", verb: "recalled" },
    ];
    const { counts } = summarizeGroup(members);
    expect(counts).toBe("2 memories");
  });
});
