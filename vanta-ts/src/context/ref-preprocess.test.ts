import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { contextRefBudgetChars, formatContextRefReceipt, preprocessContextRefs } from "./ref-preprocess.js";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("context reference preprocessing", () => {
  it("derives a bounded expansion budget from the routed model window", () => {
    expect(contextRefBudgetChars(1_000)).toBe(4_000);
    expect(contextRefBudgetChars(32_000)).toBe(19_200);
    expect(contextRefBudgetChars(1_000_000)).toBe(60_000);
  });

  it("keeps source and warning receipts scoped and refuses an oversized ref", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-ref-preprocess-")); roots.push(root);
    await writeFile(join(root, "small.txt"), "hello", "utf8");
    await writeFile(join(root, "large.txt"), "x".repeat(5_000), "utf8");
    const result = await preprocessContextRefs("use @file:small.txt and @file:large.txt", {
      root, contextWindow: 1_000, scopeId: "profile-a",
    });
    expect(result.expanded).toEqual(["@file:small.txt"]);
    expect(result.warnings[0]).toMatch(/large.*4000 character limit/i);
    expect(formatContextRefReceipt(result)).toMatch(/scope profile-a[\s\S]*Expanded: @file:small.txt[\s\S]*Warning:/);
  });
});
