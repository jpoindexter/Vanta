import { describe, expect, it } from "vitest";
import { explainFormula } from "./formula.js";

describe("formula explanation", () => {
  it("names functions, inputs, and arithmetic without evaluating the formula", () => {
    const explanation = explainFormula("=IF(B2>0,SUM('Data Set'!C2:C8)*$D$1,0)");
    expect(explanation).toContain("IF (chooses a result from a condition)");
    expect(explanation).toContain("SUM (adds values)");
    expect(explanation).toContain("'Data Set'!C2:C8");
    expect(explanation).toContain("$D$1");
    expect(explanation).toContain("multiplies");
  });
});
