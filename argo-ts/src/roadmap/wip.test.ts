import { describe, it, expect } from "vitest";
import { checkWipLimit, WipLimitError, WIP_LIMIT } from "./wip.js";

const mk = (id: string, status: string) => ({ id, status });

describe("checkWipLimit", () => {
  it("returns null when toStatus is not building", () => {
    const items = [mk("A", "building"), mk("B", "building")];
    expect(checkWipLimit(items, "C", "next")).toBeNull();
    expect(checkWipLimit(items, "C", "shipped")).toBeNull();
    expect(checkWipLimit(items, "C", "horizon")).toBeNull();
  });

  it("returns null when no items are in building", () => {
    const items = [mk("A", "next"), mk("B", "shipped")];
    expect(checkWipLimit(items, "C", "building")).toBeNull();
  });

  it("returns null when building count is below the limit", () => {
    const items = [mk("A", "building"), mk("B", "next")];
    expect(checkWipLimit(items, "C", "building")).toBeNull();
  });

  it("returns WipLimitError when building count equals the limit", () => {
    const items = [mk("A", "building"), mk("B", "building"), mk("C", "next")];
    const err = checkWipLimit(items, "C", "building");
    expect(err).toBeInstanceOf(WipLimitError);
    expect(err?.count).toBe(2);
    expect(err?.limit).toBe(WIP_LIMIT);
  });

  it("excludes the moving item from the count (already-building re-move)", () => {
    const items = [mk("A", "building"), mk("B", "building")];
    // A is already in building; moving A→building shouldn't count A itself
    expect(checkWipLimit(items, "A", "building")).toBeNull();
  });

  it("respects a custom limit", () => {
    const items = [mk("A", "building")];
    expect(checkWipLimit(items, "B", "building", 1)).toBeInstanceOf(WipLimitError);
    expect(checkWipLimit(items, "B", "building", 2)).toBeNull();
  });

  it("error message contains the count/limit fraction", () => {
    const items = [mk("A", "building"), mk("B", "building")];
    const err = checkWipLimit(items, "C", "building");
    expect(err?.message).toContain("2/2");
    expect(err?.message).toMatch(/shipped|park|finish/i);
  });

  it("WipLimitError is an Error with the correct name", () => {
    const err = new WipLimitError(2, 2);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(WipLimitError);
    expect(err.name).toBe("WipLimitError");
  });
});
