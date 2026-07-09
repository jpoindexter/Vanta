import { describe, expect, it } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { marketingReadTool } from "./marketing-read.js";

describe("marketing_read tool", () => {
  it("reads Customer.io fixture campaigns", async () => {
    const dir = join(tmpdir(), `vanta-marketing-tool-${Date.now()}`);
    const fixture = join(dir, "cio.json");
    await mkdir(dir, { recursive: true });
    await writeFile(fixture, JSON.stringify({ campaigns: [{ id: "c1", name: "Welcome", sent_count: 9 }] }));
    try {
      const result = await marketingReadTool.execute({ provider: "customerio", fixture }, { root: dir } as never);
      expect(result.ok).toBe(true);
      expect(result.output).toContain("customerio campaign c1 · Welcome · 9");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
