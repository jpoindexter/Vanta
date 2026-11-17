import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { ReplCtx } from "./types.js";

vi.mock("../status.js", () => ({
  gatherStatus: vi.fn(async () => ({ marker: "health" })),
  formatStatus: vi.fn(() => "Vanta health"),
  resolveStatusCondensed: vi.fn(() => false),
}));

import { doctor } from "./doctor-cmd.js";

describe("/doctor", () => {
  it("combines runtime health with the read-only context audit", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-doctor-"));
    await mkdir(join(root, ".vanta"));
    await writeFile(join(root, "AGENTS.md"), "Never expose credentials.\n");

    const result = await doctor("", {
      env: {},
      dataDir: join(root, ".vanta"),
    } as ReplCtx);

    expect(result.output).toContain("Vanta health");
    expect(result.output).toContain("Harness Thickness Audit");
    expect(result.output).toContain("/skill context-doctor");
  });
});
