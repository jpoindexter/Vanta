import { describe, expect, it, vi } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { blueprint } from "./blueprint-cmd.js";

describe("/blueprint", () => {
  it("lists blueprints when no name is supplied", async () => {
    const result = await blueprint("", { dataDir: await mkdtemp(join(tmpdir(), "vanta-slash-bp-")), env: process.env } as never);
    expect(result.output).toContain("daily-brief");
  });

  it("prompts only for missing key=value fields", async () => {
    const result = await blueprint("github-pr-review id=review-pr", { dataDir: await mkdtemp(join(tmpdir(), "vanta-slash-bp-")), env: process.env } as never);
    expect(result.output).toContain("Missing: deliver");
    expect(result.output).toContain("/blueprint github-pr-review id=review-pr deliver=<value>");
  });

  it("previews complete inline values without creating state", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "vanta-slash-bp-"));
    const result = await blueprint("github-pr-review id=review-pr deliver=local", { dataDir, env: process.env } as never);
    expect(result.output).toContain("Preview github-pr-review");
    expect(result.output).toContain("vanta automation apply github-pr-review id=review-pr deliver=local --yes");
    expect(vi.isMockFunction(blueprint)).toBe(false);
  });
});
