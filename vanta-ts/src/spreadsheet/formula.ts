import ExcelJS from "exceljs";

const FUNCTION_MEANINGS: Record<string, string> = {
  SUM: "adds values", AVERAGE: "calculates the mean", IF: "chooses a result from a condition", XLOOKUP: "looks up a matching value",
  INDEX: "returns a value by position", MATCH: "finds a relative position", NPV: "discounts future cash flows", IRR: "estimates an internal rate of return",
  MIN: "selects the minimum", MAX: "selects the maximum", ROUND: "rounds a number", COUNT: "counts numeric cells", COUNTA: "counts nonempty cells",
};

export function explainFormula(formula: string): string {
  const clean = formula.trim().replace(/^=/, ""), functions = [...clean.matchAll(/\b([A-Z][A-Z0-9.]*)\s*\(/gi)].map((match) => match[1]!.toUpperCase());
  const references = [...clean.matchAll(/(?:'[^']+'|[A-Za-z_][\w.]*)?!?\$?[A-Z]{1,3}\$?[1-9]\d*(?::\$?[A-Z]{1,3}\$?[1-9]\d*)?/g)].map((match) => match[0]);
  const operators = [[/\+/g, "adds"], [/-/g, "subtracts"], [/\*/g, "multiplies"], [/\//g, "divides"], [/\^/g, "raises to a power"]] as const;
  const operations = operators.filter(([pattern]) => pattern.test(clean)).map(([, label]) => label);
  const parts = [
    functions.length ? `Functions: ${[...new Set(functions)].map((name) => `${name} (${FUNCTION_MEANINGS[name] ?? "applies a workbook function"})`).join(", ")}.` : "No workbook functions; this is a direct expression.",
    references.length ? `Inputs: ${[...new Set(references)].join(", ")}.` : "No cell or range inputs.",
    operations.length ? `Operations: ${operations.join(", ")}.` : "No arithmetic operators.",
  ];
  return parts.join(" ");
}

export function explainCellFormula(sheet: ExcelJS.Worksheet, cell: string): string {
  const value = sheet.getCell(cell).value;
  if (!value || typeof value !== "object" || !("formula" in value)) throw new Error(`cell has no formula: ${sheet.name}!${cell}`);
  return `${sheet.name}!${cell} = ${value.formula}\n${explainFormula(String(value.formula))}`;
}
