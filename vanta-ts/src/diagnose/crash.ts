export type CrashKind = "dyld-missing-library" | "sandbox-denial" | "generic-stack" | "unknown";
export type EvidenceLine = { line: number; text: string };
export type CrashDiagnosis = {
  kind: CrashKind;
  title: string;
  likelyCause: string;
  evidence: EvidenceLine[];
  nextSteps: string[];
};

export const GREG_UITESTS_CRASH_FIXTURE = [
  "Process:               GregUITests-Runner [4213]",
  "Identifier:            com.example.GregUITests-Runner",
  "Exception Type:        EXC_CRASH (SIGABRT)",
  "Termination Reason:    Namespace DYLD, Code 1 Library missing",
  "Dyld Error Message:",
  "  Library not loaded: @rpath/lib_TestingInterop.dylib",
  "  Referenced from: /Users/jason/Library/Developer/Xcode/DerivedData/Greg/Build/Products/Debug-iphonesimulator/GregUITests-Runner.app/PlugIns/GregUITests.xctest/GregUITests",
  "  Reason: tried: '/usr/lib/swift/lib_TestingInterop.dylib' (no such file), '@rpath/lib_TestingInterop.dylib' (no such file)",
].join("\n");

export function diagnoseCrashLog(input: string): CrashDiagnosis {
  const lines = input.split(/\r?\n/);
  const dyld = pickEvidence(lines, [/DYLD/i, /Library not loaded/i, /@rpath\/.*\.dylib/i, /Reason: tried:/i, /Exception Type:/i]);
  if (dyld.some((e) => /Library not loaded|@rpath\/.*\.dylib/i.test(e.text))) {
    const lib = firstMatch(dyld, /(?:Library not loaded:\s*)?(@rpath\/\S+\.dylib|\S+\.dylib)/i) ?? "a required dynamic library";
    return dyldDiagnosis(lib, dyld);
  }

  const sandbox = pickEvidence(lines, [/sandbox/i, /deny\(\d+\)/i, /Operation not permitted/i, /not permitted by sandbox/i]);
  if (sandbox.length) return sandboxDiagnosis(sandbox);

  const stack = pickEvidence(lines, [/Exception Type:/i, /\bFatal error:/i, /^\s*\d+\s+\S+/, /\bat\s+\S+[\w.]+\(/, /Thread \d+ Crashed/i]);
  if (stack.length) return stackDiagnosis(stack);

  return {
    kind: "unknown",
    title: "Unknown crash/log shape",
    likelyCause: "No known crash signature was found. Provide the exception header, termination reason, and the first crashed stack frames.",
    evidence: [],
    nextSteps: ["Re-run with the full crash report or build log, not just the final error sentence."],
  };
}

export function formatCrashDiagnosis(d: CrashDiagnosis): string {
  const evidence = d.evidence.length ? d.evidence.map((e) => `  L${e.line}: ${e.text}`) : ["  (no matching evidence lines)"];
  return [
    `Crash-log diagnosis: ${d.title}`,
    `Likely cause: ${d.likelyCause}`,
    "",
    "Evidence:",
    ...evidence,
    "",
    "Next:",
    ...d.nextSteps.map((s, i) => `  ${i + 1}. ${s}`),
  ].join("\n");
}

function dyldDiagnosis(lib: string, evidence: EvidenceLine[]): CrashDiagnosis {
  return {
    kind: "dyld-missing-library",
    title: `Missing dynamic library: ${lib}`,
    likelyCause: `The XCTest runner launched, but dyld aborted because ${lib} was not on the test bundle runtime search path.`,
    evidence: evidence.slice(0, 6),
    nextSteps: [
      "In the UI test target, verify the framework/library that provides TestingInterop is linked and embedded for tests.",
      "Check Runpath Search Paths and test-host settings so @rpath resolves inside the .xctest bundle and runner app.",
      "Clean DerivedData, rebuild the test bundle, then rerun the same xcodebuild test command.",
    ],
  };
}

function sandboxDiagnosis(evidence: EvidenceLine[]): CrashDiagnosis {
  return {
    kind: "sandbox-denial",
    title: "Sandbox permission denial",
    likelyCause: "The process was blocked by a sandbox rule before it could read, write, launch, or bind the requested resource.",
    evidence: evidence.slice(0, 6),
    nextSteps: [
      "Identify the denied path or operation in the cited line.",
      "Add the needed workspace root or relaunch with the intended sandbox setting before retrying.",
      "Retry the exact command after the permission boundary is changed.",
    ],
  };
}

function stackDiagnosis(evidence: EvidenceLine[]): CrashDiagnosis {
  return {
    kind: "generic-stack",
    title: "Generic exception or stack trace",
    likelyCause: "The log contains a crash header or stack trace, but no dyld or sandbox signature matched.",
    evidence: evidence.slice(0, 6),
    nextSteps: [
      "Use the first crashed thread frame as the starting code path.",
      "Reproduce with symbols enabled so the top app-owned frame and exception reason are visible.",
      "Patch the smallest failing path, then lock the pasted report as a regression fixture.",
    ],
  };
}

function pickEvidence(lines: string[], patterns: RegExp[]): EvidenceLine[] {
  return lines.flatMap((text, index) => patterns.some((p) => p.test(text)) ? [{ line: index + 1, text: text.trim() }] : []);
}

function firstMatch(lines: EvidenceLine[], pattern: RegExp): string | null {
  for (const line of lines) {
    const m = line.text.match(pattern);
    if (m?.[1]) return m[1];
  }
  return null;
}
