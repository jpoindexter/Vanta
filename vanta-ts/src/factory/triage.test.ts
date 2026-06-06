import { describe, it, expect } from "vitest";
import {
  parseVitestOutput,
  parseTscOutput,
  parseRoadmapItem,
  parseParkedItem,
  selectWorkItem,
} from "./triage.js";

const VITEST_PASSING = JSON.stringify({ numFailedTests: 0, testResults: [] });

const VITEST_FAILING = JSON.stringify({
  numFailedTests: 2,
  testResults: [
    {
      testFilePath: "src/tools/foo.test.ts",
      status: "failed",
      assertionResults: [{ fullName: "foo > does the thing", status: "failed", failureMessages: ["expected true"] }],
    },
  ],
});

const ROADMAP_CLEAN = "## v1\n- [x] done item\n- [x] also done\n";
const ROADMAP_OPEN = "## v1\n- [x] done item\n- [ ] build the thing (S)\n- [ ] second item\n";
const PARKED_EMPTY = "# Parked\n";
const PARKED_WITH_ITEM = "## some-feature\nCaptured 2026-06-01\n\n## another-feature\nCaptured 2026-06-02\n";

describe("parseVitestOutput", () => {
  it("returns null when all tests pass", () => {
    expect(parseVitestOutput(VITEST_PASSING)).toBeNull();
  });

  it("returns a test-failure WorkItem for failing tests", () => {
    const item = parseVitestOutput(VITEST_FAILING);
    expect(item?.category).toBe("test-failure");
    expect(item?.targetFile).toContain("foo.test.ts");
    expect(item?.hint).toContain("foo > does the thing");
  });

  it("returns null on malformed JSON", () => {
    expect(parseVitestOutput("not json")).toBeNull();
  });
});

describe("parseTscOutput", () => {
  it("returns null on empty stderr (clean)", () => {
    expect(parseTscOutput("")).toBeNull();
  });

  it("returns a type-error WorkItem when tsc has output", () => {
    const stderr = "src/foo.ts(12,5): error TS2322: Type 'string' is not assignable to type 'number'.";
    const item = parseTscOutput(stderr);
    expect(item?.category).toBe("type-error");
    expect(item?.targetFile).toContain("src/foo.ts");
    expect(item?.hint).toContain("TS2322");
  });
});

describe("parseRoadmapItem", () => {
  it("returns null when all items checked", () => {
    expect(parseRoadmapItem(ROADMAP_CLEAN)).toBeNull();
  });

  it("returns first unchecked item", () => {
    const item = parseRoadmapItem(ROADMAP_OPEN);
    expect(item?.category).toBe("roadmap");
    expect(item?.description).toContain("build the thing");
    expect(item?.sourceLine).toBe(3); // 1-based
  });
});

describe("parseParkedItem", () => {
  it("returns null for empty parked", () => {
    expect(parseParkedItem(PARKED_EMPTY)).toBeNull();
  });

  it("returns first ## section header as a parked work item", () => {
    const item = parseParkedItem(PARKED_WITH_ITEM);
    expect(item?.category).toBe("parked");
    expect(item?.description).toContain("some-feature");
  });
});

describe("selectWorkItem priority", () => {
  it("test-failure beats roadmap", () => {
    const item = selectWorkItem({
      vitestJson: VITEST_FAILING,
      tscStderr: "",
      roadmap: ROADMAP_OPEN,
      parked: PARKED_EMPTY,
    });
    expect(item?.category).toBe("test-failure");
  });

  it("roadmap beats parked when tests clean", () => {
    const item = selectWorkItem({
      vitestJson: VITEST_PASSING,
      tscStderr: "",
      roadmap: ROADMAP_OPEN,
      parked: PARKED_WITH_ITEM,
    });
    expect(item?.category).toBe("roadmap");
  });

  it("returns null when nothing to do", () => {
    const item = selectWorkItem({
      vitestJson: VITEST_PASSING,
      tscStderr: "",
      roadmap: ROADMAP_CLEAN,
      parked: PARKED_EMPTY,
    });
    expect(item).toBeNull();
  });
});
