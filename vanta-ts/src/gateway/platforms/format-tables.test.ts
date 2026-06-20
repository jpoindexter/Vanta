import { describe, it, expect } from "vitest";
import { degradeTables } from "./format-tables.js";

describe("degradeTables — detection", () => {
  it("reformats a 3-column table into bold-heading + key:value bullets", () => {
    const md = [
      "| Name | Role | Status |",
      "| --- | --- | --- |",
      "| Alice | Admin | Active |",
      "| Bob | User | Pending |",
    ].join("\n");

    const out = degradeTables(md);

    expect(out).toBe(
      [
        "**Alice**",
        "- Role: Admin",
        "- Status: Active",
        "",
        "**Bob**",
        "- Role: User",
        "- Status: Pending",
      ].join("\n"),
    );
  });

  it("uses the first column as the heading and the rest as bullets", () => {
    const md = ["| Key | Value |", "| :-- | --: |", "| Port | 7788 |"].join("\n");

    const out = degradeTables(md);

    expect(out).toBe(["**Port**", "- Value: 7788"].join("\n"));
  });

  it("accepts colon-aligned separators (:---:, :--, --:)", () => {
    const md = ["| A | B |", "| :---: | :--: |", "| 1 | 2 |"].join("\n");

    expect(degradeTables(md)).toBe(["**1**", "- B: 2"].join("\n"));
  });
});

describe("degradeTables — ragged rows", () => {
  it("renders a missing trailing cell as an empty value", () => {
    const md = ["| Name | Role | Team |", "| --- | --- | --- |", "| Alice | Admin |"].join("\n");

    const out = degradeTables(md);

    expect(out).toBe(["**Alice**", "- Role: Admin", "- Team: "].join("\n"));
  });

  it("keys an extra cell beyond the header by its column position", () => {
    const md = ["| Name | Role |", "| --- | --- |", "| Alice | Admin | Extra |"].join("\n");

    const out = degradeTables(md);

    expect(out).toBe(["**Alice**", "- Role: Admin", "- Column 3: Extra"].join("\n"));
  });
});

describe("degradeTables — non-table text untouched", () => {
  it("leaves plain prose with no pipes unchanged", () => {
    const md = "Just a normal sentence.\nAnd another line.";

    expect(degradeTables(md)).toBe(md);
  });

  it("leaves a header+row pair with no separator unchanged (not a table)", () => {
    const md = ["| Name | Role |", "| Alice | Admin |"].join("\n");

    expect(degradeTables(md)).toBe(md);
  });

  it("leaves a single pipe line with no following row unchanged", () => {
    const md = "use a | b shell pipe";

    expect(degradeTables(md)).toBe(md);
  });

  it("preserves prose surrounding a degraded table", () => {
    const md = [
      "Here is the data:",
      "| A | B |",
      "| --- | --- |",
      "| 1 | 2 |",
      "Done.",
    ].join("\n");

    const out = degradeTables(md);

    expect(out).toBe(["Here is the data:", "**1**", "- B: 2", "Done."].join("\n"));
  });
});
