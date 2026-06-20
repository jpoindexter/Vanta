import { describe, expect, it } from "vitest";
import {
  buildLaunchpadBrief,
  extractScope,
  seedFromSource,
  type ReadFile,
} from "./launchpad.js";

/** A small but realistic PRD-like doc: headings, scope bullets, a non-goals section, constraints. */
const SAMPLE_PRD = `# Operator Profile

A local trusted-operator agent that knows the goal before it picks a tool.

## In scope
- Read the active goals and Operator Profile before acting.
- Extract scope and entities from a PRD before the first tool call.

## Constraints
- Vanta must gate every action through the Kernel.
- It should never write outside the project root without approval.

## Out of scope
- Multi-tenancy and RBAC.
- A plugin marketplace.
`;

describe("extractScope", () => {
  it("pulls named entities from headings and capitalized noun phrases", () => {
    // arrange + act
    const result = extractScope(SAMPLE_PRD);
    // assert
    expect(result.entities).toContain("Operator Profile");
    expect(result.entities).toContain("Kernel");
  });

  it("ranks an entity that recurs across sections above a one-off mention", () => {
    // arrange
    const doc = `# Kernel
## Kernel safety
- The Kernel gates everything.
- A widget exists once.`;
    // act
    const { entities } = extractScope(doc);
    // assert
    expect(entities[0]).toBe("Kernel");
  });

  it("collects in-scope bullet items as scope", () => {
    const { scope } = extractScope(SAMPLE_PRD);
    expect(scope).toContain("Extract scope and entities from a PRD before the first tool call.");
  });

  it("excludes bullets under an out-of-scope heading from scope", () => {
    const { scope } = extractScope(SAMPLE_PRD);
    expect(scope.some((s) => s.includes("Multi-tenancy"))).toBe(false);
    expect(scope.some((s) => s.includes("plugin marketplace"))).toBe(false);
  });

  it("captures obligation lines (must / should / never) as constraints", () => {
    const { constraints } = extractScope(SAMPLE_PRD);
    expect(constraints.some((c) => c.includes("must gate every action"))).toBe(true);
    expect(constraints.some((c) => c.includes("never write outside"))).toBe(true);
  });

  it("returns a safe empty result for empty input", () => {
    expect(extractScope("")).toEqual({ entities: [], scope: [], constraints: [] });
  });

  it("returns a safe empty result for garbage with no structure", () => {
    const result = extractScope("!@#$ %^&* ()  ;;; --- ...");
    expect(result.entities).toEqual([]);
    expect(result.scope).toEqual([]);
    expect(result.constraints).toEqual([]);
  });

  it("does not treat a bare stop-word as an entity", () => {
    const { entities } = extractScope("The thing happened. This is fine.");
    expect(entities).not.toContain("The");
    expect(entities).not.toContain("This");
  });

  it("strips markdown emphasis and code before matching entities", () => {
    const { entities } = extractScope("- The **Goal Ledger** persists `goals.tsv`.");
    expect(entities).toContain("Goal Ledger");
  });

  it("caps entities, scope, and constraints so a huge doc can't blow the budget", () => {
    const bigScope = Array.from({ length: 40 }, (_, i) => `- Item ${i} must hold`).join("\n");
    const result = extractScope(`# Big\n## In scope\n${bigScope}`);
    expect(result.entities.length).toBeLessThanOrEqual(12);
    expect(result.scope.length).toBeLessThanOrEqual(10);
    expect(result.constraints.length).toBeLessThanOrEqual(10);
  });
});

describe("buildLaunchpadBrief", () => {
  it("leads with the source provenance so grounding is traceable", () => {
    const brief = buildLaunchpadBrief("docs/prd.md", extractScope(SAMPLE_PRD));
    expect(brief.startsWith("# Launchpad brief — grounded in docs/prd.md")).toBe(true);
  });

  it("renders extracted entities, scope, and constraints as sections", () => {
    const brief = buildLaunchpadBrief("docs/prd.md", extractScope(SAMPLE_PRD));
    expect(brief).toContain("## Entities");
    expect(brief).toContain("## Scope");
    expect(brief).toContain("## Constraints");
    expect(brief).toContain("Kernel");
  });

  it("instructs the agent to reference the scope before the first tool call", () => {
    const brief = buildLaunchpadBrief("docs/prd.md", extractScope(SAMPLE_PRD));
    expect(brief).toContain("before the first tool call");
    expect(brief).toContain("out of scope");
  });

  it("refuses to launch from thin air when nothing could be extracted", () => {
    const brief = buildLaunchpadBrief("noise.txt", { entities: [], scope: [], constraints: [] });
    expect(brief).toContain("Do NOT launch from thin air");
  });
});

describe("seedFromSource", () => {
  const reader = (files: Record<string, string>): ReadFile => async (path) => {
    const found = files[path];
    if (found === undefined) throw new Error(`ENOENT: no such file ${path}`);
    return found;
  };

  it("reads a named doc through the injected fs and extracts its scope", async () => {
    // arrange
    const read = reader({ "docs/prd.md": SAMPLE_PRD });
    // act
    const result = await seedFromSource("docs/prd.md", read);
    // assert
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.path).toBe("docs/prd.md");
      expect(result.source).toBe(SAMPLE_PRD);
      expect(result.extracted.entities).toContain("Kernel");
    }
  });

  it("returns an error value for a blank path instead of throwing", async () => {
    const result = await seedFromSource("   ", reader({}));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("no source path");
  });

  it("returns an error value when the read fails", async () => {
    const result = await seedFromSource("missing.md", reader({}));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("could not read source");
  });

  it("returns an error value for an empty source doc", async () => {
    const result = await seedFromSource("blank.md", reader({ "blank.md": "   \n  \n" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("empty");
  });

  it("trims whitespace around the requested path", async () => {
    const result = await seedFromSource("  docs/prd.md  ", reader({ "docs/prd.md": SAMPLE_PRD }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.path).toBe("docs/prd.md");
  });
});
