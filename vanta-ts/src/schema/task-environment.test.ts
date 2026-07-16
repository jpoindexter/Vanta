import { describe, expect, it } from "vitest";
import {
  createBrowserFixture,
  createMalformedActObservationFixture,
  createMalformedObservationFixture,
  createRepoFixture,
} from "./fixtures.js";
import { replayFixture, runTaskStep } from "./task-environment.js";

describe("task environment contract", () => {
  it("replays the repo fixture deterministically", async () => {
    const actions = [
      { type: "write", path: "README.md", content: "hello" },
      { type: "write", path: "notes.md", content: "done" },
    ];

    const first = await replayFixture(createRepoFixture(), actions);
    const second = await replayFixture(createRepoFixture(), actions);

    expect(first).toEqual(second);
    expect(first.ok).toBe(true);
    expect(first.transitions).toHaveLength(2);
    expect(first.transitions.at(-1)?.verification).toMatchObject({ ok: true });
  });

  it("returns a typed invalid_action result before acting", async () => {
    const result = await runTaskStep(createRepoFixture(), { type: "delete", path: "README.md" });

    expect(result).toEqual({ ok: false, error: { code: "invalid_action", message: "invalid action" } });
  });

  it("returns a typed malformed_observation result", async () => {
    const result = await runTaskStep(createMalformedObservationFixture(), { type: "wait" });

    expect(result).toEqual({ ok: false, error: { code: "malformed_observation", message: "malformed observation" } });
  });

  it("returns a typed malformed_observation result when act returns invalid data", async () => {
    const result = await runTaskStep(createMalformedActObservationFixture(), { type: "wait" });

    expect(result).toEqual({
      ok: false,
      error: { code: "malformed_observation", message: "malformed observation" },
    });
  });

  it("replays a browser fixture through a predicted and observed transition", async () => {
    const actions = [
      { type: "navigate", url: "https://example.test/login" },
      { type: "type", selector: "#email", value: "operator@example.test" },
    ];
    const result = await replayFixture(createBrowserFixture(), actions);
    const repeated = await replayFixture(createBrowserFixture(), actions);

    expect(result.ok).toBe(true);
    expect(result).toEqual(repeated);
    expect(result.transitions[0]).toMatchObject({
      prediction: { summary: "navigate to https://example.test/login" },
      observed: { url: "https://example.test/login", fields: {} },
    });
    expect(result.transitions[1]).toMatchObject({
      observed: { fields: { "#email": "operator@example.test" } },
    });
  });
});
