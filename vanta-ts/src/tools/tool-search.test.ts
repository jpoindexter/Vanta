import { describe, it, expect } from "vitest";
import { buildToolSearchTool } from "./tool-search.js";
import { buildRegistry } from "./index.js";
import type { ToolContext } from "./types.js";

const ctx = {} as ToolContext;
const search = buildToolSearchTool(buildRegistry());

async function run(query: string): Promise<string> {
  const r = await search.execute({ query }, ctx);
  return r.output;
}

describe("tool_search", () => {
  it("finds write_file from a multi-keyword query (the bug that stalled a turn)", async () => {
    const out = await run("write file create edit shell");
    expect(out).toContain("write_file");
    expect(out).not.toContain("no tools matched");
  });

  it("ranks by how many query terms match (write_file outranks unrelated tools)", async () => {
    const out = await run("write file");
    expect(out.indexOf("## write_file")).toBeGreaterThanOrEqual(0);
  });

  it("still matches a single keyword by name", async () => {
    expect(await run("read_file")).toContain("read_file");
  });

  it("returns a clear miss for a genuinely unknown term", async () => {
    expect(await run("zzzznotarealtoolqqq")).toContain("no tools matched");
  });
});
