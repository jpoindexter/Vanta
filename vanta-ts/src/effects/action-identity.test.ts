import { expect, it } from "vitest";
import { sameEffectAction } from "./action-identity.js";

it("normalizes only compatibility verbs, never case-sensitive targets or commands", () => {
  expect(sameEffectAction("edit file brief.md", "Edit file brief.md")).toBe(true);
  expect(sameEffectAction("run command", "Run command")).toBe(true);
  expect(sameEffectAction("edit file A.md", "Edit file a.md")).toBe(false);
  expect(sameEffectAction("run shell command: echo A", "Run shell command: echo a")).toBe(false);
  expect(sameEffectAction(undefined, "Edit file brief.md")).toBe(false);
});
