import { describe, expect, it } from "vitest";
import {
  GroundedStateSchema,
  diffGroundedStates,
  groundTransition,
  reviseGroundedState,
  type TaskTransitionRecord,
} from "./index.js";
import { browserGroundingAdapter, repoGroundingAdapter } from "./grounding-fixtures.js";

function transition(observed: unknown, sequence = 1): TaskTransitionRecord {
  return {
    kind: "task_transition",
    version: 1,
    runId: "run-grounding",
    sequence,
    status: "observed",
    adapterId: "fixture",
    taskEnvironmentVersion: "1",
    model: { provider: "test", id: "model", version: "1" },
    approval: { mode: "default", resolution: "approved" },
    correlation: { sessionId: "session", turnId: `turn-${sequence}`, actionId: `action-${sequence}` },
    before: { snapshot: {}, observation: {} },
    action: {},
    prediction: { summary: "fixture prediction" },
    observed,
    after: {},
    verification: { ok: true, summary: "fixture verified" },
  };
}

describe("Schema state grounding", () => {
  it("grounds repo observations into stable, provenance-bearing entities and a diff", () => {
    const first = groundTransition(transition({ paths: ["README.md"] }, 1), repoGroundingAdapter);
    const second = groundTransition(transition({ paths: ["README.md", "src/app.ts"] }, 2), repoGroundingAdapter, first);

    expect(first.entities[0]).toMatchObject({ id: "file:README.md", type: "file", confidence: 1 });
    expect(first.entities[0]?.provenance[0]).toMatchObject({ runId: "run-grounding", transitionSequence: 1 });
    expect(first.entities[0]?.properties.path).toMatchObject({ value: "README.md", confidence: 1 });
    expect(second.entities.find((entity) => entity.id === "file:README.md")?.id).toBe("file:README.md");
    expect(second.counters.fileCount).toMatchObject({ value: 2, confidence: 1 });
    expect(diffGroundedStates(first, second)).toEqual({
      addedEntities: ["file:src/app.ts"],
      removedEntities: [],
      changedEntities: [],
      changedCounters: ["fileCount"],
    });
  });

  it("keeps browser page and field identities stable across steps", () => {
    const first = groundTransition(transition({ url: "https://example.com", fields: { "#email": "" } }, 1), browserGroundingAdapter);
    const second = groundTransition(transition({ url: "https://example.com/next", fields: { "#email": "a@example.com" } }, 2), browserGroundingAdapter, first);

    expect(first.entities.map((entity) => entity.id)).toContain("page:active");
    expect(second.entities.map((entity) => entity.id)).toContain("page:active");
    expect(first.entities.map((entity) => entity.id)).toContain("field:#email");
    expect(second.entities.map((entity) => entity.id)).toContain("field:#email");
    expect(diffGroundedStates(first, second).changedEntities).toEqual(["field:#email", "page:active"]);
  });

  it("adds a missing variable from a counterexample without mutating the prior representation", () => {
    const original = groundTransition(transition({ paths: ["README.md"] }), repoGroundingAdapter);
    const revised = reviseGroundedState(original, {
      kind: "set-property",
      entityId: "file:README.md",
      property: "language",
      value: "markdown",
      confidence: 0.9,
      source: "counterexample: extension determines language",
    });

    expect(original.representationVersion).toBe(1);
    expect(original.entities[0]?.properties.language).toBeUndefined();
    expect(revised.representationVersion).toBe(2);
    expect(revised.entities[0]?.properties.language).toMatchObject({ value: "markdown", confidence: 0.9, superseded: [] });
  });

  it("preserves a superseded field value when a counterexample revises it", () => {
    const original = groundTransition(transition({ paths: ["README.md"] }), repoGroundingAdapter);
    const revised = reviseGroundedState(original, {
      kind: "set-property",
      entityId: "file:README.md",
      property: "path",
      value: "docs/README.md",
      confidence: 0.8,
      source: "counterexample: file moved",
    });

    const path = revised.entities[0]?.properties.path;
    expect(path?.value).toBe("docs/README.md");
    expect(path?.superseded).toHaveLength(1);
    expect(path?.superseded[0]).toMatchObject({ value: "README.md", confidence: 1 });
    expect(original.entities[0]?.properties.path?.value).toBe("README.md");
  });

  it("revises entity boundaries while retaining the superseded entity", () => {
    const original = groundTransition(transition({ paths: ["bundle.ts"] }), repoGroundingAdapter);
    const revised = reviseGroundedState(original, {
      kind: "split-entity",
      entityId: "file:bundle.ts",
      replacements: [
        { id: "module:api", type: "module", properties: { role: "api" } },
        { id: "module:ui", type: "module", properties: { role: "ui" } },
      ],
      confidence: 0.75,
      source: "counterexample: one file contains two task entities",
    });

    expect(revised.entities.map((entity) => entity.id)).toEqual(["module:api", "module:ui"]);
    expect(revised.supersededEntities.map((entity) => entity.id)).toContain("file:bundle.ts");
    expect(original.entities.map((entity) => entity.id)).toEqual(["file:bundle.ts"]);
  });

  it("rejects confidence outside the closed zero-to-one range", () => {
    const state = groundTransition(transition({ paths: [] }), repoGroundingAdapter);
    const malformed = structuredClone(state);
    malformed.counters.fileCount!.confidence = 1.1;
    expect(GroundedStateSchema.safeParse(malformed).success).toBe(false);
  });
});
