import { describe, it, expect } from "vitest";
import { formatPending, handleReview, type ReviewCmdDeps } from "./review-cmd.js";
import type { RevisionRecord } from "../cofounder/outcome-approval.js";
import { recordWorkProduct, setApproved, type WorkProduct } from "../cofounder/work-products.js";

const NOW = new Date("2026-06-20T12:00:00.000Z");

function wp(spec?: Partial<Parameters<typeof recordWorkProduct>[1]>, existing: WorkProduct[] = []): WorkProduct {
  const r = recordWorkProduct(
    existing,
    { artifact: "Q3 plan.md", sourceTaskId: "task-7", departmentId: "growth", producedBy: "scout", ...spec },
    NOW,
  );
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

type Harness = {
  deps: ReviewCmdDeps;
  lines: string[];
  reran: string[];
  appended: RevisionRecord[];
  list: () => WorkProduct[];
};

function harness(initial: WorkProduct[] = []): Harness {
  const state = { list: initial };
  const lines: string[] = [];
  const reran: string[] = [];
  const appended: RevisionRecord[] = [];
  const deps: ReviewCmdDeps = {
    readWorkProducts: async () => state.list,
    review: {
      setApproved: async (id, approved) => {
        const r = setApproved(state.list, id, approved);
        if (r.ok) state.list = r.value;
        return r;
      },
      rerunTask: async (sourceTaskId) => {
        reran.push(sourceTaskId);
      },
      appendRevision: async (record) => {
        appended.push(record);
      },
      now: () => NOW,
    },
    log: (line) => lines.push(line),
  };
  return { deps, lines, reran, appended, list: () => state.list };
}

describe("handleReview — pending", () => {
  it("lists only the not-yet-approved artifacts", async () => {
    const h = harness([wp({ departmentId: "a" }), wp({ departmentId: "b", approved: true })]);
    const code = await handleReview(["pending"], h.deps);
    expect(code).toBe(0);
    const out = h.lines.join("\n");
    expect(out).toContain("a-wp-1");
    expect(out).not.toContain("b-wp-1");
  });

  it("reports an empty queue when everything is approved", async () => {
    const h = harness([wp({ approved: true })]);
    await handleReview(["pending"], h.deps);
    expect(h.lines.join("\n")).toContain("no pending artifacts");
  });
});

describe("handleReview — approve", () => {
  it("flips the work product's approved state", async () => {
    const h = harness([wp()]);
    const code = await handleReview(["approve", "growth-wp-1"], h.deps);
    expect(code).toBe(0);
    expect(h.list().find((p) => p.id === "growth-wp-1")?.approved).toBe(true);
    expect(h.lines.join("\n")).toContain("approved growth-wp-1");
  });

  it("returns 1 and the error for an unknown id", async () => {
    const h = harness([wp()]);
    const code = await handleReview(["approve", "nope"], h.deps);
    expect(code).toBe(1);
    expect(h.lines.join("\n")).toContain("nope");
  });

  it("returns 1 with usage when no id is given", async () => {
    const h = harness([wp()]);
    const code = await handleReview(["approve"], h.deps);
    expect(code).toBe(1);
    expect(h.lines.join("\n")).toContain("approve needs a work-product id");
  });
});

describe("handleReview — revise", () => {
  it("records the multi-word reason and re-runs the producing task", async () => {
    const h = harness([wp({ sourceTaskId: "task-99" })]);
    const code = await handleReview(["revise", "growth-wp-1", "tone", "is", "off"], h.deps);
    expect(code).toBe(0);
    expect(h.appended).toHaveLength(1);
    expect(h.appended[0]?.reason).toBe("tone is off");
    expect(h.reran).toEqual(["task-99"]);
    expect(h.list().find((p) => p.id === "growth-wp-1")?.approved).toBe(false); // stays pending
    expect(h.lines.join("\n")).toContain("revision requested for growth-wp-1");
  });

  it("returns 1 with usage when the reason is missing", async () => {
    const h = harness([wp()]);
    const code = await handleReview(["revise", "growth-wp-1"], h.deps);
    expect(code).toBe(1);
    expect(h.reran).toHaveLength(0);
    expect(h.lines.join("\n")).toContain("revise needs a work-product id and a reason");
  });

  it("returns 1 and the error for an unknown id", async () => {
    const h = harness([wp()]);
    const code = await handleReview(["revise", "ghost", "redo"], h.deps);
    expect(code).toBe(1);
    expect(h.reran).toHaveLength(0);
    expect(h.lines.join("\n")).toContain("ghost");
  });
});

describe("handleReview — dispatch", () => {
  it("prints usage and returns 0 for no subcommand", async () => {
    const h = harness();
    expect(await handleReview([], h.deps)).toBe(0);
    expect(h.lines.join("\n")).toContain("usage:");
  });

  it("returns 1 for an unknown subcommand", async () => {
    const h = harness();
    expect(await handleReview(["bogus"], h.deps)).toBe(1);
  });
});

describe("formatPending", () => {
  it("renders id, kind, artifact, provenance, and source task", () => {
    const line = formatPending(wp({ kind: "report" }));
    expect(line).toContain("growth-wp-1");
    expect(line).toContain("report");
    expect(line).toContain("Q3 plan.md");
    expect(line).toContain("growth/scout");
    expect(line).toContain("task task-7");
  });
});
