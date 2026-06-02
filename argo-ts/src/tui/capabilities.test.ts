import { describe, it, expect } from "vitest";
import { groupToolsByDomain } from "./capabilities.js";

describe("groupToolsByDomain", () => {
  it("groups tools into ordered domains", () => {
    const groups = groupToolsByDomain([
      "read_file",
      "write_file",
      "shell_cmd",
      "web_search",
      "gmail_send",
      "calendar_read",
      "git_commit",
      "recall",
    ]);
    const byLabel = Object.fromEntries(groups.map((g) => [g.label, g.tools]));
    expect(byLabel["Files"]).toEqual(["read_file", "write_file"]);
    expect(byLabel["Code & shell"]).toEqual(["shell_cmd"]);
    expect(byLabel["Web & research"]).toEqual(["web_search"]);
    expect(byLabel["Comms (email · calendar · drive)"]).toEqual(["gmail_send", "calendar_read"]);
    expect(byLabel["Git"]).toEqual(["git_commit"]);
    expect(byLabel["Memory & skills"]).toEqual(["recall"]);
    // Files comes before Comms (fixed domain order).
    expect(groups[0]!.label).toBe("Files");
  });

  it("collects unknown tools under Other and drops empty domains", () => {
    const groups = groupToolsByDomain(["read_file", "frobnicate"]);
    expect(groups.map((g) => g.label)).toEqual(["Files", "Other"]);
    expect(groups.find((g) => g.label === "Other")!.tools).toEqual(["frobnicate"]);
  });

  it("returns nothing for no tools", () => {
    expect(groupToolsByDomain([])).toEqual([]);
  });
});
