import { describe, expect, it } from "vitest";
import { diagnoseCrashLog, formatCrashDiagnosis, GREG_UITESTS_CRASH_FIXTURE } from "./crash.js";

describe("diagnoseCrashLog", () => {
  it("diagnoses the GregUITests dyld missing-library crash", () => {
    const diagnosis = diagnoseCrashLog(GREG_UITESTS_CRASH_FIXTURE);
    expect(diagnosis.kind).toBe("dyld-missing-library");
    expect(diagnosis.title).toContain("@rpath/lib_TestingInterop.dylib");
    expect(diagnosis.likelyCause).toContain("dyld aborted");
    expect(formatCrashDiagnosis(diagnosis)).toContain("L6: Library not loaded: @rpath/lib_TestingInterop.dylib");
    expect(formatCrashDiagnosis(diagnosis)).toContain("Runpath Search Paths");
  });

  it("diagnoses sandbox denials", () => {
    const diagnosis = diagnoseCrashLog("sandboxd: deny(1) file-read-data /private/tmp/app.db\nOperation not permitted");
    expect(diagnosis.kind).toBe("sandbox-denial");
    expect(formatCrashDiagnosis(diagnosis)).toContain("Add the needed workspace root");
  });

  it("falls back to a generic stack diagnosis", () => {
    const diagnosis = diagnoseCrashLog("Fatal error: index out of range\nThread 0 Crashed:\n0   App  MyView.body.getter + 44");
    expect(diagnosis.kind).toBe("generic-stack");
    expect(formatCrashDiagnosis(diagnosis)).toContain("first crashed thread frame");
  });
});
