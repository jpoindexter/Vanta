import { describe, expect, it } from "vitest";
import { handleLead, type LeadDeps } from "./lead-cmd.js";
import type { LeadershipChatResult, LeadershipWorkObject } from "../cofounder/leadership-chat.js";
import { resolveLeadershipMessage } from "../cofounder/leadership-chat.js";

const NOW = new Date("2026-07-09T20:00:00.000Z");

function deps(seed: LeadershipWorkObject[] = []): LeadDeps & { lines: string[]; objects: LeadershipWorkObject[] } {
  const lines: string[] = [];
  const objects = [...seed];
  return {
    lines,
    objects,
    record: async (message: string): Promise<LeadershipChatResult> => {
      const result = resolveLeadershipMessage(message, objects, NOW);
      objects.push(...result.objects);
      return result;
    },
    read: async () => objects,
    log: (line) => void lines.push(line),
  };
}

describe("lead command", () => {
  it("records work objects from a lead-agent message", async () => {
    const d = deps();
    const code = await handleLead(["Approve", "the", "launch", "plan"], d);
    expect(code).toBe(0);
    expect(d.objects.map((o) => o.kind)).toEqual(["approval", "plan"]);
    expect(d.lines.join("\n")).toContain("Created 2 tracked work objects");
    expect(d.lines.join("\n")).toContain("lead-approval-1 · approval · open");
  });

  it("lists existing leadership work objects", async () => {
    const seed = resolveLeadershipMessage("Decide the launch date", [], NOW).objects;
    const d = deps(seed);
    const code = await handleLead(["list"], d);
    expect(code).toBe(0);
    expect(d.lines.join("\n")).toContain("lead-decision-1 · decision · decided");
  });

  it("prints usage when called without a message", async () => {
    const d = deps();
    const code = await handleLead([], d);
    expect(code).toBe(0);
    expect(d.lines.join("\n")).toContain("vanta lead");
  });
});
