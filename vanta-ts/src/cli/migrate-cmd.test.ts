import { describe, it, expect } from "vitest";
import { parseSelection } from "./migrate-cmd.js";

describe("parseSelection", () => {
  it("brings all three footprints when no footprint flag is passed", () => {
    expect(parseSelection([])).toEqual({ skills: true, mcp: true, model: true, overwrite: false });
  });
  it("narrows to only the named footprints", () => {
    expect(parseSelection(["--skills"])).toEqual({ skills: true, mcp: false, model: false, overwrite: false });
    expect(parseSelection(["--mcp", "--model"])).toEqual({ skills: false, mcp: true, model: true, overwrite: false });
  });
  it("--overwrite is orthogonal — it never narrows the footprint set", () => {
    expect(parseSelection(["--overwrite"])).toEqual({ skills: true, mcp: true, model: true, overwrite: true });
  });
});
