import { describe, it, expect } from "vitest";
import { toolLoaderFrame, toolLoaderLabel, toolLoaderRows } from "./tool-loader.js";
import { ASTERISK_FRAMES } from "../term/figures.js";
import type { PendingTool } from "./types.js";

describe("toolLoaderFrame", () => {
  it("cycles through the shared asterisk frames by tick", () => {
    expect(toolLoaderFrame(0)).toBe(ASTERISK_FRAMES[0]);
    expect(toolLoaderFrame(1)).toBe(ASTERISK_FRAMES[1]);
    expect(toolLoaderFrame(ASTERISK_FRAMES.length)).toBe(ASTERISK_FRAMES[0]); // wraps
  });
});

describe("toolLoaderLabel", () => {
  it("capitalizes the verb and parenthesizes the detail (matches the result header)", () => {
    expect(toolLoaderLabel({ name: "read_file", verb: "read", detail: "x.ts" })).toBe("Read(x.ts)");
  });
  it("omits the parens when there is no detail", () => {
    expect(toolLoaderLabel({ name: "inspect_state", verb: "inspected", detail: "" })).toBe("Inspected");
  });
});

describe("toolLoaderRows", () => {
  it("renders one loader row per in-flight tool (parallel-safe), each with the live frame", () => {
    const tools: PendingTool[] = [
      { name: "read_file", verb: "read", detail: "a.ts" },
      { name: "shell_cmd", verb: "ran", detail: "build" },
    ];
    const rows = toolLoaderRows(tools, 0);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.label).toBe("Read(a.ts)");
    expect(rows[1]!.label).toBe("Ran(build)");
    expect(rows[0]!.frame).toBe(ASTERISK_FRAMES[0]);
    expect(rows[1]!.frame).toBe(ASTERISK_FRAMES[0]);
  });

  it("gives each row a stable unique key even when two tools share a name", () => {
    const tools: PendingTool[] = [
      { name: "read_file", verb: "read", detail: "a.ts" },
      { name: "read_file", verb: "read", detail: "b.ts" },
    ];
    const keys = toolLoaderRows(tools, 3).map((r) => r.key);
    expect(new Set(keys).size).toBe(2);
  });

  it("returns no rows when nothing is running", () => {
    expect(toolLoaderRows([], 5)).toEqual([]);
  });
});
