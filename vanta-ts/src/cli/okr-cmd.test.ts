import { describe, it, expect } from "vitest";
import {
  formatObjective,
  handleOkr,
  progressBar,
  type OkrDeps,
} from "./okr-cmd.js";
import { addObjective, type Objective } from "../cofounder/okr.js";

const NOW = new Date("2026-06-20T12:00:00.000Z");

function objective(
  title: string,
  keyResults: Objective["keyResults"],
  departmentId?: string,
): Objective {
  const r = addObjective([], { title, departmentId, keyResults }, NOW);
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

type Harness = { deps: OkrDeps; lines: string[] };

function harness(objectives: Objective[] = []): Harness {
  const lines: string[] = [];
  const deps: OkrDeps = {
    readObjectives: async () => objectives,
    log: (line) => lines.push(line),
  };
  return { deps, lines };
}

describe("progressBar", () => {
  it("renders an empty bar at 0%", () => {
    expect(progressBar(0, 10)).toBe("[░░░░░░░░░░] 0%");
  });

  it("renders a full bar at 100%", () => {
    expect(progressBar(1, 10)).toBe("[██████████] 100%");
  });

  it("renders a half bar at 50%", () => {
    expect(progressBar(0.5, 10)).toBe("[█████░░░░░] 50%");
  });

  it("clamps out-of-range fractions", () => {
    expect(progressBar(2, 10)).toBe("[██████████] 100%");
    expect(progressBar(-1, 10)).toBe("[░░░░░░░░░░] 0%");
  });
});

describe("formatObjective", () => {
  it("renders the title, owner, overall bar, and per-KR bars", () => {
    const obj = objective("Grow Revenue", [{ name: "mrr", current: 50, target: 100 }], "sales");
    const text = formatObjective(obj);
    expect(text).toMatch(/grow-revenue · Grow Revenue \(sales\)/);
    expect(text).toMatch(/50%/); // overall + KR both 50%
    expect(text).toMatch(/mrr: 50\/100/);
  });

  it("notes when there are no key results", () => {
    const obj = objective("Empty", []);
    expect(formatObjective(obj)).toMatch(/\(no key results\)/);
  });
});

describe("handleOkr list", () => {
  it("lists objectives with an overall progress bar", async () => {
    const h = harness([
      objective("Grow Revenue", [{ name: "mrr", current: 25, target: 100 }], "sales"),
    ]);
    expect(await handleOkr(["list"], h.deps)).toBe(0);
    expect(h.lines.join("\n")).toMatch(/grow-revenue · Grow Revenue \(sales\) \[/);
    expect(h.lines.join("\n")).toMatch(/25%/);
  });

  it("notes when there are no objectives", async () => {
    const h = harness();
    expect(await handleOkr(["list"], h.deps)).toBe(0);
    expect(h.lines.join("\n")).toMatch(/no objectives/);
  });
});

describe("handleOkr show", () => {
  it("shows per-KR blocks plus the furthest-from-target ranking", async () => {
    const h = harness([
      objective("Grow Revenue", [{ name: "mrr", current: 90, target: 100 }], "sales"), // gap 10%
      objective("Growth", [{ name: "signups", current: 20, target: 100 }], "growth"), // gap 80%
    ]);
    expect(await handleOkr(["show"], h.deps)).toBe(0);
    const out = h.lines.join("\n");
    expect(out).toMatch(/mrr: 90\/100/);
    expect(out).toMatch(/signups: 20\/100/);
    expect(out).toMatch(/furthest from target: Growth \(growth\) · signups \(gap 80%\)/);
  });

  it("shows one objective by id", async () => {
    const h = harness([objective("Grow Revenue", [{ name: "mrr", current: 50, target: 100 }])]);
    expect(await handleOkr(["show", "grow-revenue"], h.deps)).toBe(0);
    expect(h.lines.join("\n")).toMatch(/grow-revenue · Grow Revenue/);
    // single-objective view does not append the cross-objective ranking line
    expect(h.lines.join("\n")).not.toMatch(/furthest from target/);
  });

  it("errors on an unknown objective id", async () => {
    const h = harness([objective("Grow Revenue", [])]);
    expect(await handleOkr(["show", "nope"], h.deps)).toBe(1);
    expect(h.lines.join("\n")).toMatch(/unknown objective "nope"/);
  });

  it("notes when there are no objectives", async () => {
    const h = harness();
    expect(await handleOkr(["show"], h.deps)).toBe(0);
    expect(h.lines.join("\n")).toMatch(/no objectives/);
  });
});

describe("handleOkr dispatch", () => {
  it("prints usage on an unknown subcommand", async () => {
    const h = harness();
    expect(await handleOkr(["wat"], h.deps)).toBe(1);
    expect(h.lines.join("\n")).toMatch(/usage:/);
  });

  it("prints usage and returns 0 on no subcommand", async () => {
    const h = harness();
    expect(await handleOkr([], h.deps)).toBe(0);
    expect(h.lines.join("\n")).toMatch(/usage:/);
  });
});
