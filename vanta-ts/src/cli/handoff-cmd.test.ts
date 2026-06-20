import { describe, expect, it } from "vitest";
import {
  formatContext,
  formatHandoff,
  handleHandoff,
  type HandoffDeps,
} from "./handoff-cmd.js";
import type { GetArtifact, HandoffEdge, InjectedContext, ResolvedArtifact } from "../cofounder/handoff.js";

// `vanta handoff` surface — `handleHandoff` is pure over injected store + artifact-
// resolver deps + a log sink; `formatHandoff`/`formatContext` are pure renderers.
// No real I/O.

const FIXED_NOW = new Date("2026-06-20T12:00:00.000Z");

type Fixture = {
  edges?: HandoffEdge[];
  library?: Record<string, ResolvedArtifact>;
};

function buildDeps(fixture: Fixture = {}): { deps: HandoffDeps; lines: string[]; written: HandoffEdge[][] } {
  const store: HandoffEdge[] = [...(fixture.edges ?? [])];
  const written: HandoffEdge[][] = [];
  const lines: string[] = [];
  const library = fixture.library ?? {};
  const getArtifact: GetArtifact = (id) => library[id] ?? null;
  const deps: HandoffDeps = {
    readHandoffs: async () => store,
    writeHandoffs: async (list) => {
      written.push(list);
    },
    getArtifact,
    log: (line) => lines.push(line),
    now: () => FIXED_NOW,
  };
  return { deps, lines, written };
}

describe("handleHandoff add", () => {
  it("records + persists an edge and returns exit 0", async () => {
    const { deps, lines, written } = buildDeps();

    const code = await handleHandoff(["add", "growth-wp-1", "growth", "brand"], deps);

    expect(code).toBe(0);
    expect(written).toHaveLength(1);
    expect(written[0]?.[0]).toMatchObject({
      id: "handoff-1",
      workProductId: "growth-wp-1",
      fromDepartment: "growth",
      toDepartment: "brand",
    });
    expect(lines[0]).toContain("handed off growth-wp-1: growth → brand (handoff-1)");
  });

  it("rejects a self hand-off without persisting", async () => {
    const { deps, lines, written } = buildDeps();

    const code = await handleHandoff(["add", "wp", "growth", "growth"], deps);

    expect(code).toBe(1);
    expect(written).toHaveLength(0);
    expect(lines[0]).toMatch(/cannot hand off to itself/);
  });

  it("prints usage when add is missing arguments", async () => {
    const { deps, lines, written } = buildDeps();

    const code = await handleHandoff(["add", "wp", "growth"], deps);

    expect(code).toBe(1);
    expect(written).toHaveLength(0);
    expect(lines[0]).toContain("add needs <workProductId> <fromDept> <toDept>");
  });
});

describe("handleHandoff list", () => {
  it("renders every edge newest-first", async () => {
    const edges: HandoffEdge[] = [
      { id: "handoff-1", workProductId: "growth-wp-1", fromDepartment: "growth", toDepartment: "brand", createdAt: "2026-06-20T00:00:00.000Z" },
      { id: "handoff-2", workProductId: "sales-wp-1", fromDepartment: "sales", toDepartment: "brand", createdAt: "2026-06-21T00:00:00.000Z" },
    ];
    const { deps, lines } = buildDeps({ edges });

    const code = await handleHandoff(["list"], deps);

    expect(code).toBe(0);
    expect(lines[0]).toContain("handoff-2 · sales-wp-1 · sales → brand");
    expect(lines[1]).toContain("handoff-1 · growth-wp-1 · growth → brand");
  });

  it("reports the empty case", async () => {
    const { deps, lines } = buildDeps();
    const code = await handleHandoff(["list"], deps);
    expect(code).toBe(0);
    expect(lines[0]).toContain("no hand-offs");
  });
});

describe("handleHandoff context", () => {
  const edges: HandoffEdge[] = [
    { id: "handoff-1", workProductId: "growth-wp-1", fromDepartment: "growth", toDepartment: "brand", createdAt: "2026-06-20T00:00:00.000Z" },
    { id: "handoff-2", workProductId: "growth-wp-2", fromDepartment: "growth", toDepartment: "brand", createdAt: "2026-06-20T01:00:00.000Z" },
  ];

  it("injects ONLY approved upstream artifacts for the target department", async () => {
    const { deps, lines } = buildDeps({
      edges,
      library: {
        "growth-wp-1": { content: "Q3 GTM plan", approved: true },
        "growth-wp-2": { content: "draft, not locked", approved: false }, // excluded
      },
    });

    const code = await handleHandoff(["context", "brand"], deps);

    expect(code).toBe(0);
    const out = lines.join("\n");
    expect(out).toContain("1 artifact(s)");
    expect(out).toContain("growth-wp-1 (from growth)");
    expect(out).toContain("Q3 GTM plan");
    expect(out).not.toContain("draft, not locked");
  });

  it("reports no context when nothing approved is handed off", async () => {
    const { deps, lines } = buildDeps({
      edges,
      library: { "growth-wp-1": { content: "draft", approved: false } /* growth-wp-2 missing */ },
    });

    const code = await handleHandoff(["context", "brand"], deps);

    expect(code).toBe(0);
    expect(lines[0]).toContain("no injected context for brand");
  });

  it("prints usage when context is missing the department", async () => {
    const { deps, lines } = buildDeps();
    const code = await handleHandoff(["context"], deps);
    expect(code).toBe(1);
    expect(lines[0]).toContain("context needs a <toDept>");
  });
});

describe("handleHandoff dispatch", () => {
  it("prints usage for an unknown subcommand (exit 1)", async () => {
    const { deps, lines } = buildDeps();
    expect(await handleHandoff(["bogus"], deps)).toBe(1);
    expect(lines[0]).toContain("usage:");
  });

  it("prints usage for no subcommand (exit 0)", async () => {
    const { deps, lines } = buildDeps();
    expect(await handleHandoff([], deps)).toBe(0);
    expect(lines[0]).toContain("usage:");
  });
});

describe("formatters", () => {
  it("formatHandoff renders id · workProduct · from → to", () => {
    const edge: HandoffEdge = { id: "handoff-1", workProductId: "wp", fromDepartment: "a", toDepartment: "b", createdAt: FIXED_NOW.toISOString() };
    expect(formatHandoff(edge)).toBe("handoff-1 · wp · a → b");
  });

  it("formatContext renders a header + one block per artifact", () => {
    const ctx: InjectedContext[] = [
      { workProductId: "wp-1", fromDepartment: "growth", content: "plan" },
      { workProductId: "wp-2", fromDepartment: "sales", content: "pipeline" },
    ];
    const out = formatContext("brand", ctx);
    expect(out).toContain("injected context for brand · 2 artifact(s):");
    expect(out).toContain("wp-1 (from growth)");
    expect(out).toContain("plan");
    expect(out).toContain("wp-2 (from sales)");
    expect(out).toContain("pipeline");
  });

  it("formatContext renders the empty case", () => {
    expect(formatContext("brand", [])).toContain("no injected context for brand");
  });
});
