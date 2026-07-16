import { describe, expect, it } from "vitest";
import { TASK_ENVIRONMENT_VERSION, runTaskStep } from "./index.js";
import { createRepoFixture } from "./fixtures.js";

describe("schema module boundary", () => {
  it("exports the versioned task runner from one stable entrypoint", async () => {
    expect(TASK_ENVIRONMENT_VERSION).toBe("1");

    const result = await runTaskStep(createRepoFixture(), {
      type: "write",
      path: "README.md",
      content: "ready",
    });

    expect(result.ok).toBe(true);
  });
});
