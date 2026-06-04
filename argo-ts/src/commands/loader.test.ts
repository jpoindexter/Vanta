import { describe, it, expect } from "vitest";
import { loadUserCommands, type UserCommand } from "./loader.js";

describe("loadUserCommands", () => {
  it("returns empty array when commands dir does not exist", async () => {
    const cmds = await loadUserCommands({ ARGO_HOME: "/tmp/nonexistent-argo-home-xyz" });
    expect(cmds).toEqual([]);
  });

  it("returns array of UserCommand objects", async () => {
    // Use a known empty home — commands/ won't exist → no commands
    const cmds = await loadUserCommands({ ARGO_HOME: "/tmp" });
    expect(Array.isArray(cmds)).toBe(true);
  });
});
