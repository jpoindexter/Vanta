import { describe, expect, it } from "vitest";
import {
  formatLeadershipWorkObject,
  readLeadershipWork,
  recordLeadershipMessage,
  resolveLeadershipMessage,
  writeLeadershipWork,
  type LeadershipWorkObject,
  type LeadershipWorkStoreFs,
} from "./leadership-chat.js";

const NOW = new Date("2026-07-09T20:00:00.000Z");

function memFs(): { fs: LeadershipWorkStoreFs; files: Map<string, string> } {
  const files = new Map<string, string>();
  return {
    files,
    fs: {
      readFile: async (p) => {
        const value = files.get(p);
        if (value === undefined) throw new Error("ENOENT");
        return value;
      },
      writeFile: async (p, data) => void files.set(p, data),
      mkdir: async () => {},
    },
  };
}

const ENV = { VANTA_HOME: "/tmp/vanta-lead-test" } as NodeJS.ProcessEnv;

describe("resolveLeadershipMessage", () => {
  it("turns a lead-agent message into tracked work objects", () => {
    const result = resolveLeadershipMessage(
      "Approve the launch plan, decide the pricing tradeoff, and fix the onboarding issue",
      [],
      NOW,
    );
    expect(result.reply).toContain("Created 4 tracked work objects");
    expect(result.objects.map((o) => o.kind)).toEqual(["approval", "plan", "decision", "issue"]);
    expect(result.objects.every((o) => o.sourceMessage.includes("launch plan"))).toBe(true);
  });

  it("defaults a freeform request to an issue so chat never stays only prose", () => {
    const result = resolveLeadershipMessage("Check what is stuck this week", [], NOW);
    expect(result.objects).toMatchObject([{ kind: "issue", title: expect.stringContaining("Check what is stuck") }]);
  });

  it("allocates ids after existing records", () => {
    const existing: LeadershipWorkObject[] = [{
      id: "lead-issue-1",
      kind: "issue",
      title: "Issue: old",
      detail: "old",
      sourceMessage: "old",
      status: "open",
      createdAt: NOW.toISOString(),
    }];
    const result = resolveLeadershipMessage("Fix billing", existing, NOW);
    expect(result.objects[0]?.id).toBe("lead-issue-2");
  });
});

describe("leadership work store", () => {
  it("records a message to the durable local store", async () => {
    const { fs } = memFs();
    const result = await recordLeadershipMessage("Build a plan for onboarding", ENV, fs, NOW);
    expect(result.objects.map((o) => o.kind)).toEqual(["plan", "issue"]);
    expect(await readLeadershipWork(ENV, fs)).toHaveLength(2);
  });

  it("round-trips records and drops malformed rows", async () => {
    const { fs, files } = memFs();
    await writeLeadershipWork(resolveLeadershipMessage("Approve deployment", [], NOW).objects, ENV, fs);
    const path = [...files.keys()][0]!;
    const stored = JSON.parse(files.get(path)!);
    stored.objects.push({ id: "" });
    files.set(path, JSON.stringify(stored));
    const read = await readLeadershipWork(ENV, fs);
    expect(read.map((o) => o.kind)).toEqual(["approval"]);
  });

  it("formats records for CLI output", () => {
    const object = resolveLeadershipMessage("Decide the positioning", [], NOW).objects[0]!;
    expect(formatLeadershipWorkObject(object)).toContain("lead-decision-1 · decision · decided");
  });
});
