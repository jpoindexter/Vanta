import { describe, it, expect, afterEach } from "vitest";
import { beginDiagnosticDelta } from "./diagnostic-note.js";

// These cover the opt-in gate + eligibility short-circuits — the paths that
// avoid the (expensive) semantic TS build. The delta logic itself is covered by
// diagnostic-delta.test.ts.

const saved = process.env.VANTA_DIAGNOSTIC_DELTA;
afterEach(() => {
  if (saved === undefined) delete process.env.VANTA_DIAGNOSTIC_DELTA;
  else process.env.VANTA_DIAGNOSTIC_DELTA = saved;
});

describe("beginDiagnosticDelta (diagnostic-baseline gate)", () => {
  it("is a no-op when the opt-in flag is unset (default off)", async () => {
    delete process.env.VANTA_DIAGNOSTIC_DELTA;
    const finish = await beginDiagnosticDelta("/some/file.ts", true);
    expect(await finish()).toBe("");
  });

  it("is a no-op for a non-.ts file even when enabled", async () => {
    process.env.VANTA_DIAGNOSTIC_DELTA = "1";
    const finish = await beginDiagnosticDelta("/some/notes.md", true);
    expect(await finish()).toBe("");
  });

  it("is a no-op for .d.ts / test files even when enabled", async () => {
    process.env.VANTA_DIAGNOSTIC_DELTA = "1";
    expect(await (await beginDiagnosticDelta("/x/types.d.ts", true))()).toBe("");
    expect(await (await beginDiagnosticDelta("/x/foo.test.ts", true))()).toBe("");
  });
});
