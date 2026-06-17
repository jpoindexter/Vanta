import { describe, it, expect } from "vitest";
import { CodegraphProvider } from "./codegraph.js";

// Integration smoke test against the real `codegraph` CLI. Self-skips when the
// binary is not installed, mirroring agent.test.ts's "skip if kernel down".
const provider = new CodegraphProvider();
const available = await provider.isAvailable();

describe.skipIf(!available)("CodegraphProvider (live binary)", () => {
  it("reports availability true when the binary is present", async () => {
    expect(await provider.isAvailable()).toBe(true);
  });

  it("returns index status text for the current repo", async () => {
    const out = await provider.status({ root: process.cwd() });
    expect(out.length).toBeGreaterThan(0);
  });
});

describe("CodegraphProvider (no binary)", () => {
  it("reports unavailable for a non-existent binary, without throwing", async () => {
    const missing = new CodegraphProvider("codegraph-does-not-exist-xyz");
    expect(await missing.isAvailable()).toBe(false);
  });
});
