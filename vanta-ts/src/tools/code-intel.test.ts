import { describe, it, expect, afterEach } from "vitest";
import { codeContextTool } from "./code-context.js";
import { codeSearchTool } from "./code-search.js";
import { codeAffectedTool } from "./code-affected.js";
import { codeIndexTool } from "./code-index.js";
import type { ToolContext } from "./types.js";

const ctx = { root: process.cwd() } as ToolContext;
const prev = process.env.VANTA_CODE_INTEL;
afterEach(() => {
  if (prev === undefined) delete process.env.VANTA_CODE_INTEL;
  else process.env.VANTA_CODE_INTEL = prev;
});

describe("code-intel tools — schema", () => {
  it("expose the four stable tool names", () => {
    expect(codeContextTool.schema.name).toBe("code_context");
    expect(codeSearchTool.schema.name).toBe("code_search");
    expect(codeAffectedTool.schema.name).toBe("code_affected");
    expect(codeIndexTool.schema.name).toBe("code_index");
  });
});

describe("code-intel tools — graceful degrade when disabled", () => {
  it("return ok:false (never throw) when code intelligence is off", async () => {
    process.env.VANTA_CODE_INTEL = "off";
    const r1 = await codeContextTool.execute({ task: "anything" }, ctx);
    const r2 = await codeSearchTool.execute({ query: "x" }, ctx);
    const r3 = await codeAffectedTool.execute({ files: ["a.ts"] }, ctx);
    const r4 = await codeIndexTool.execute({}, ctx);
    for (const r of [r1, r2, r3, r4]) {
      expect(r.ok).toBe(false);
      expect(r.output).toMatch(/unavailable/i);
    }
  });
});

describe("code-intel tools — arg validation", () => {
  it("reject missing/invalid args with ok:false", async () => {
    process.env.VANTA_CODE_INTEL = "off";
    expect((await codeContextTool.execute({}, ctx)).ok).toBe(false);
    expect((await codeSearchTool.execute({}, ctx)).ok).toBe(false);
    expect((await codeAffectedTool.execute({ files: [] }, ctx)).ok).toBe(false);
  });
});
