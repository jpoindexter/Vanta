import { describe, expect, it } from "vitest";
import { playbookId, type Playbook } from "../cofounder/org-learning.js";
import {
  formatPlaybook,
  formatPlaybookLine,
  handlePlaybook,
  type PlaybookDeps,
} from "./playbook-cmd.js";

function pb(departmentId: string, taskType: string, steps: string[], fromTaskIds: string[]): Playbook {
  return { id: playbookId(departmentId, taskType), departmentId, taskType, steps, fromTaskIds };
}

function deps(list: Playbook[]): { deps: PlaybookDeps; lines: string[] } {
  const lines: string[] = [];
  return { lines, deps: { readPlaybooks: async () => list, log: (l) => lines.push(l) } };
}

describe("formatPlaybookLine", () => {
  it("summarizes id, department, type, and counts", () => {
    expect(formatPlaybookLine(pb("growth", "report", ["a", "b"], ["t1", "t2", "t3"]))).toBe(
      "pb:growth:report · growth · report · 2 step(s) · from 3 task(s)",
    );
  });
});

describe("formatPlaybook", () => {
  it("renders numbered steps + provenance", () => {
    const out = formatPlaybook(pb("growth", "report", ["pull metrics", "draft summary"], ["t1", "t2", "t3"]));
    expect(out).toContain("pb:growth:report");
    expect(out).toContain("  department: growth");
    expect(out).toContain("    1. pull metrics");
    expect(out).toContain("    2. draft summary");
    expect(out).toContain("  from tasks: t1, t2, t3");
  });

  it("shows a placeholder when there are no steps", () => {
    expect(formatPlaybook(pb("growth", "report", [], ["t1"]))).toContain("    (no steps)");
  });
});

describe("handlePlaybook list", () => {
  it("prints a guidance line when empty (exit 0)", async () => {
    const { deps: d, lines } = deps([]);
    expect(await handlePlaybook(["list"], d)).toBe(0);
    expect(lines[0]).toContain("no playbooks yet");
  });

  it("prints one sorted line per playbook (exit 0)", async () => {
    const { deps: d, lines } = deps([
      pb("sales", "outreach", ["s"], ["t9"]),
      pb("growth", "report", ["a", "b"], ["t1", "t2", "t3"]),
    ]);
    expect(await handlePlaybook(["list"], d)).toBe(0);
    // sorted by department: growth before sales
    expect(lines[0]).toContain("pb:growth:report");
    expect(lines[1]).toContain("pb:sales:outreach");
  });
});

describe("handlePlaybook show", () => {
  it("prints full detail for a known id (exit 0)", async () => {
    const { deps: d, lines } = deps([pb("growth", "report", ["step one"], ["t1", "t2", "t3"])]);
    expect(await handlePlaybook(["show", playbookId("growth", "report")], d)).toBe(0);
    expect(lines.join("\n")).toContain("    1. step one");
  });

  it("errors on an unknown id (exit 1)", async () => {
    const { deps: d, lines } = deps([]);
    expect(await handlePlaybook(["show", "pb:nope:nope"], d)).toBe(1);
    expect(lines[0]).toContain('unknown playbook "pb:nope:nope"');
  });

  it("errors when no id is given (exit 1)", async () => {
    const { deps: d, lines } = deps([]);
    expect(await handlePlaybook(["show"], d)).toBe(1);
    expect(lines.join("\n")).toContain("show needs a playbook id");
  });
});

describe("handlePlaybook dispatch", () => {
  it("prints usage and exits 0 with no subcommand", async () => {
    const { deps: d, lines } = deps([]);
    expect(await handlePlaybook([], d)).toBe(0);
    expect(lines.join("\n")).toContain("usage:");
  });

  it("prints usage and exits 1 on an unknown subcommand", async () => {
    const { deps: d, lines } = deps([]);
    expect(await handlePlaybook(["bogus"], d)).toBe(1);
    expect(lines.join("\n")).toContain("usage:");
  });
});
