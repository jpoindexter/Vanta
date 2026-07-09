import { describe, expect, it } from "vitest";
import { diagnoseCrash } from "./crash-diagnose-cmd.js";

describe("/diagnose-crash", () => {
  it("runs the bundled GregUITests crash fixture", async () => {
    const result = await diagnoseCrash("--demo greg-uitests", {} as never);
    expect(result.output).toContain("Crash-log diagnosis: Missing dynamic library: @rpath/lib_TestingInterop.dylib");
    expect(result.output).toContain("L6: Library not loaded");
  });
});
