import ExcelJS from "exceljs";

export function formula(sheet: ExcelJS.Worksheet, cell: string, expression: string, result: number): void {
  sheet.getCell(cell).value = { formula: expression, result };
}

export function title(sheet: ExcelJS.Worksheet, text: string, columns = 8): void {
  sheet.mergeCells(1, 1, 1, columns); const cell = sheet.getCell(1, 1); cell.value = text; cell.font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } }; cell.alignment = { vertical: "middle" }; sheet.getRow(1).height = 26;
}

export function headers(sheet: ExcelJS.Worksheet, row: number, values: readonly (string | number)[]): void {
  values.forEach((value, index) => { const cell = sheet.getCell(row, index + 1); cell.value = value; cell.font = { bold: true, color: { argb: "FFFFFFFF" } }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } }; });
}

export function formatSheet(sheet: ExcelJS.Worksheet): void {
  sheet.views = [{ state: "frozen", ySplit: 2 }]; sheet.getColumn(1).width = 28;
  for (let column = 2; column <= Math.max(8, sheet.columnCount); column += 1) { sheet.getColumn(column).width = 15; sheet.getColumn(column).numFmt = "#,##0.00;[Red](#,##0.00)"; }
}

export function years(count: number): number[] { return Array.from({ length: count }, (_, index) => index + 1); }
export function median(values: readonly number[]): number { const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2; }

export function countFormulas(workbook: ExcelJS.Workbook): number {
  let count = 0; workbook.eachSheet((sheet) => sheet.eachRow((row) => row.eachCell((cell) => { if (cell.value && typeof cell.value === "object" && "formula" in cell.value) count += 1; }))); return count;
}
