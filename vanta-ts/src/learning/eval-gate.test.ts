import { describe, it, expect } from "vitest";
import { gateSkill } from "./eval-gate.js";
import type { Skill } from "../skills/types.js";

const skill = (over: Partial<Skill["meta"]> & { body?: string }): Skill => ({
  meta: {
    name: over.name ?? "debug-vitest",
    description: over.description ?? "How to debug a failing vitest run",
    created: "2026-06-22T00:00:00Z",
    updated: "2026-06-22T00:00:00Z",
    tags: over.tags ?? ["vanta-learned"],
  },
  body: over.body ?? "Run the single failing file with `npx vitest run path`, read the assertion, and fix the cause.",
});

describe("gateSkill", () => {
  const none = new Set<string>();

  it("adopts a well-formed, reusable, non-refusal skill", () => {
    expect(gateSkill(skill({}), none).passed).toBe(true);
  });

  it("rejects a too-thin body", () => {
    const r = gateSkill(skill({ body: "do it" }), none);
    expect(r.passed).toBe(false);
    expect(r.reason).toMatch(/too thin/);
  });

  it("rejects refusal / negative-claim skills (the self-imposed-limit failure mode)", () => {
    for (const body of [
      "The browser tool is broken, never use it for screenshots at all.",
      "This approach doesn't work, don't use the shell for long tasks ever.",
      "playwright cannot be used in this environment, it is unsupported here.",
    ]) {
      expect(gateSkill(skill({ body }), none).passed).toBe(false);
    }
  });

  it("rejects a skill that would shadow a hand-authored skill of the same name", () => {
    const r = gateSkill(skill({ name: "deploy-checklist" }), new Set(["deploy-checklist"]));
    expect(r.passed).toBe(false);
    expect(r.reason).toMatch(/shadow/);
  });
});
