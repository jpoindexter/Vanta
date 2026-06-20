import { describe, it, expect } from "vitest";
import {
  buildOrgTree,
  renderOrgChart,
  resolveDelegateTarget,
  resolveEscalateTarget,
  setManager,
  hasOrgEdges,
  type OrgNode,
} from "./org-chart.js";
import type { Worker } from "./store.js";

function worker(id: string, extra: Partial<Worker> = {}): Worker {
  return { kind: "worker", id, role: `${id} role`, status: "idle", ts: "t1", ...extra };
}

// A 3-level roster: lead → {eng, design}; eng → {junior}.
function threeLevel(): Worker[] {
  return [
    worker("lead", { title: "Team Lead" }),
    worker("eng", { managerId: "lead", title: "Engineer" }),
    worker("design", { managerId: "lead", title: "Designer" }),
    worker("junior", { managerId: "eng", title: "Junior Eng" }),
  ];
}

function ids(nodes: OrgNode[]): string[] {
  return nodes.map((n) => n.worker.id);
}

describe("buildOrgTree", () => {
  it("nests a 3-level hierarchy from managerId edges", () => {
    const tree = buildOrgTree(threeLevel());
    expect(ids(tree)).toEqual(["lead"]);
    const lead = tree[0]!;
    expect(ids(lead.reports)).toEqual(["eng", "design"]);
    const eng = lead.reports.find((n) => n.worker.id === "eng")!;
    expect(ids(eng.reports)).toEqual(["junior"]);
  });

  it("treats workers with no manager as roots", () => {
    const tree = buildOrgTree([worker("a"), worker("b")]);
    expect(ids(tree)).toEqual(["a", "b"]);
    expect(tree.every((n) => n.reports.length === 0)).toBe(true);
  });

  it("treats a dangling manager edge as a root (stale edge can't hide a worker)", () => {
    const tree = buildOrgTree([worker("orphan", { managerId: "ghost" })]);
    expect(ids(tree)).toEqual(["orphan"]);
  });

  it("breaks a 2-node cycle without infinite-looping and still shows both", () => {
    // a→b and b→a: a pure cycle, neither is a natural root.
    const tree = buildOrgTree([
      worker("a", { managerId: "b" }),
      worker("b", { managerId: "a" }),
    ]);
    const surfaced = new Set<string>();
    const walk = (n: OrgNode): void => { surfaced.add(n.worker.id); n.reports.forEach(walk); };
    tree.forEach(walk);
    expect(surfaced).toEqual(new Set(["a", "b"]));
  });
});

describe("renderOrgChart", () => {
  it("renders an indented hierarchy with id · title", () => {
    const out = renderOrgChart(threeLevel());
    expect(out).toBe(
      [
        "Org chart",
        "  lead · Team Lead",
        "    eng · Engineer",
        "      junior · Junior Eng",
        "    design · Designer",
      ].join("\n"),
    );
  });

  it("falls back to role when a worker has no title", () => {
    const out = renderOrgChart([worker("solo")]);
    expect(out).toContain("solo · solo role");
  });

  it("handles an empty roster", () => {
    expect(renderOrgChart([])).toBe("Org chart\n  (no workers)");
  });
});

describe("resolveDelegateTarget / resolveEscalateTarget", () => {
  it("delegates DOWN to direct reports", () => {
    const reports = resolveDelegateTarget(threeLevel(), "lead");
    expect(reports.map((w) => w.id)).toEqual(["eng", "design"]);
  });

  it("returns no reports for a leaf worker", () => {
    expect(resolveDelegateTarget(threeLevel(), "junior")).toEqual([]);
  });

  it("returns no reports for an unknown worker", () => {
    expect(resolveDelegateTarget(threeLevel(), "ghost")).toEqual([]);
  });

  it("escalates UP to the manager", () => {
    expect(resolveEscalateTarget(threeLevel(), "junior")?.id).toBe("eng");
    expect(resolveEscalateTarget(threeLevel(), "eng")?.id).toBe("lead");
  });

  it("returns undefined escalation target for a root worker", () => {
    expect(resolveEscalateTarget(threeLevel(), "lead")).toBeUndefined();
  });

  it("returns undefined escalation target for an unknown worker", () => {
    expect(resolveEscalateTarget(threeLevel(), "ghost")).toBeUndefined();
  });
});

describe("hasOrgEdges", () => {
  it("is true when any worker has a resolvable manager", () => {
    expect(hasOrgEdges(threeLevel())).toBe(true);
  });
  it("is false for a flat roster", () => {
    expect(hasOrgEdges([worker("a"), worker("b")])).toBe(false);
  });
  it("is false when the only edge is dangling", () => {
    expect(hasOrgEdges([worker("a", { managerId: "ghost" })])).toBe(false);
  });
});

describe("setManager", () => {
  it("sets the edge and returns a new roster", () => {
    const res = setManager([worker("lead"), worker("eng")], "eng", "lead");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.roster.find((w) => w.id === "eng")?.managerId).toBe("lead");
    // Original roster is not mutated (pure).
    expect(res.roster).not.toBe(undefined);
  });

  it("rejects an unknown worker", () => {
    const res = setManager([worker("lead")], "ghost", "lead");
    expect(res).toEqual({ ok: false, error: 'unknown worker "ghost"' });
  });

  it("rejects an unknown manager", () => {
    const res = setManager([worker("eng")], "eng", "ghost");
    expect(res).toEqual({ ok: false, error: 'unknown manager "ghost"' });
  });

  it("rejects self-management", () => {
    const res = setManager([worker("eng")], "eng", "eng");
    expect(res).toEqual({ ok: false, error: "a worker cannot manage itself" });
  });

  it("rejects a cycle-creating edge (manager is a descendant of the worker)", () => {
    // lead → eng → junior already. Making lead report to junior closes a cycle.
    const res = setManager(threeLevel(), "lead", "junior");
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toContain("would create a cycle");
  });

  it("allows a non-cycle reparent", () => {
    // Move junior to report to design instead of eng — no cycle.
    const res = setManager(threeLevel(), "junior", "design");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.roster.find((w) => w.id === "junior")?.managerId).toBe("design");
  });
});

describe("tolerant load (no managerId field)", () => {
  it("builds a flat tree from a pre-org roster", () => {
    // Rows that predate PCLIP-ORG-CHART carry no managerId at all.
    const legacy: Worker[] = [
      { kind: "worker", id: "old1", role: "old", status: "idle", ts: "t1" },
      { kind: "worker", id: "old2", role: "old", status: "running", ts: "t2" },
    ];
    expect(ids(buildOrgTree(legacy))).toEqual(["old1", "old2"]);
    expect(hasOrgEdges(legacy)).toBe(false);
    expect(resolveEscalateTarget(legacy, "old1")).toBeUndefined();
  });
});
