import ExcelJS from "exceljs";
import type { FinanceBrief } from "./finance-schema.js";
import { formatSheet, formula, headers, median, title, years } from "./finance-common.js";

type BuildResult = { checks: Record<string, number>; keyMetric: number };
type ForecastValue = [row: number, expression: string, result: number];

function assumptions(book: ExcelJS.Workbook, company: string, values: Record<string, number | string>): ExcelJS.Worksheet {
  const sheet = book.addWorksheet("Assumptions"); title(sheet, `${company} - Assumptions`, 3); headers(sheet, 2, ["Assumption", "Value", "Unit"]);
  Object.entries(values).forEach(([name, value], index) => { sheet.getCell(index + 3, 1).value = name; sheet.getCell(index + 3, 2).value = value; }); formatSheet(sheet); return sheet;
}

function setForecastFormula(sheet: ExcelJS.Worksheet, column: number, value: ForecastValue): void {
  const [row, expression, result] = value;
  formula(sheet, `${sheet.getColumn(column).letter}${row}`, expression, result);
}

function buildThreeStatement(book: ExcelJS.Workbook, brief: Extract<FinanceBrief, { model: "three_statement" }>): BuildResult {
  assumptions(book, brief.company, { Revenue: brief.revenue, "Revenue growth": brief.revenueGrowth, "Gross margin": brief.grossMargin, "EBITDA margin": brief.ebitdaMargin, "Tax rate": brief.taxRate, "Capex %": brief.capexPercent, "D&A %": brief.depreciationPercent, "NWC %": brief.workingCapitalPercent, "Opening cash": brief.openingCash, "Opening debt": brief.openingDebt });
  const sheet = book.addWorksheet("Three Statement"), periods = years(brief.years); title(sheet, `${brief.company} - Three Statement Model`, brief.years + 1); headers(sheet, 2, ["Line item", ...periods.map((year) => `Year ${year}`)]);
  const labels = ["Revenue", "Gross profit", "EBITDA", "D&A", "EBIT", "Taxes", "Net income", "NWC", "Change in NWC", "Capex", "Cash from operations", "Cash from investing", "Net change in cash", "Ending cash", "Net PP&E", "Total assets", "Debt", "Equity", "Liabilities + equity", "Balance check"];
  labels.forEach((label, index) => { sheet.getCell(index + 3, 1).value = label; });
  let revenue = brief.revenue, cash = brief.openingCash, priorNwc = brief.revenue * brief.workingCapitalPercent, ppe = 0, finalCheck = 0;
  periods.forEach((_, index) => {
    const col = index + 2, letter = sheet.getColumn(col).letter, prior = sheet.getColumn(col - 1).letter; revenue *= 1 + brief.revenueGrowth;
    const gross = revenue * brief.grossMargin, ebitda = revenue * brief.ebitdaMargin, da = revenue * brief.depreciationPercent, ebit = ebitda - da, taxes = Math.max(0, ebit * brief.taxRate), netIncome = ebit - taxes;
    const nwc = revenue * brief.workingCapitalPercent, changeNwc = nwc - priorNwc, capex = revenue * brief.capexPercent, cfo = netIncome + da - changeNwc, cfi = -capex, cashChange = cfo + cfi; cash += cashChange; ppe += capex - da;
    const assets = cash + nwc + ppe, equity = assets - brief.openingDebt, liabilities = brief.openingDebt + equity; finalCheck = assets - liabilities;
    const revenueFormula = index === 0 ? "Assumptions!$B$3*(1+Assumptions!$B$4)" : `${prior}3*(1+Assumptions!$B$4)`;
    const values: Array<[number, string, number]> = [[3, revenueFormula, revenue], [4, `${letter}3*Assumptions!$B$5`, gross], [5, `${letter}3*Assumptions!$B$6`, ebitda], [6, `${letter}3*Assumptions!$B$9`, da], [7, `${letter}5-${letter}6`, ebit], [8, `MAX(0,${letter}7*Assumptions!$B$7)`, taxes], [9, `${letter}7-${letter}8`, netIncome], [10, `${letter}3*Assumptions!$B$10`, nwc], [11, index === 0 ? `${letter}10-Assumptions!$B$3*Assumptions!$B$10` : `${letter}10-${prior}10`, changeNwc], [12, `${letter}3*Assumptions!$B$8`, capex], [13, `${letter}9+${letter}6-${letter}11`, cfo], [14, `-${letter}12`, cfi], [15, `${letter}13+${letter}14`, cashChange], [16, index === 0 ? `Assumptions!$B$11+${letter}15` : `${prior}16+${letter}15`, cash], [17, index === 0 ? `${letter}12-${letter}6` : `${prior}17+${letter}12-${letter}6`, ppe], [18, `${letter}16+${letter}10+${letter}17`, assets], [19, "Assumptions!$B$12", brief.openingDebt], [20, `${letter}18-${letter}19`, equity], [21, `${letter}19+${letter}20`, liabilities], [22, `${letter}18-${letter}21`, finalCheck]];
    values.forEach((value) => setForecastFormula(sheet, col, value)); priorNwc = nwc;
  });
  formatSheet(sheet); return { checks: { balance: finalCheck }, keyMetric: cash };
}

function buildDcf(book: ExcelJS.Workbook, brief: Extract<FinanceBrief, { model: "dcf" }>): BuildResult {
  assumptions(book, brief.company, { Revenue: brief.revenue, "Revenue growth": brief.revenueGrowth, "EBITDA margin": brief.ebitdaMargin, "Tax rate": brief.taxRate, "Capex %": brief.capexPercent, "D&A %": brief.depreciationPercent, "NWC %": brief.workingCapitalPercent, WACC: brief.wacc, "Terminal growth": brief.terminalGrowth, "Net debt": brief.netDebt, Shares: brief.shares });
  const sheet = book.addWorksheet("DCF"), periods = years(brief.years); title(sheet, `${brief.company} - Discounted Cash Flow`, brief.years + 1); headers(sheet, 2, ["Line item", ...periods.map((year) => `Year ${year}`)]);
  ["Revenue", "EBITDA", "D&A", "EBIT", "Taxes", "NOPAT", "Capex", "Change in NWC", "UFCF", "Discount factor", "PV of UFCF"].forEach((label, index) => { sheet.getCell(index + 3, 1).value = label; });
  let revenue = brief.revenue, priorNwc = revenue * brief.workingCapitalPercent, pv = 0, finalFcff = 0;
  periods.forEach((year, index) => { const col = index + 2, letter = sheet.getColumn(col).letter, prior = sheet.getColumn(col - 1).letter; revenue *= 1 + brief.revenueGrowth; const ebitda = revenue * brief.ebitdaMargin, da = revenue * brief.depreciationPercent, ebit = ebitda - da, taxes = Math.max(0, ebit * brief.taxRate), nopat = ebit - taxes, capex = revenue * brief.capexPercent, nwc = revenue * brief.workingCapitalPercent, changeNwc = nwc - priorNwc, ufcf = nopat + da - capex - changeNwc, discount = 1 / (1 + brief.wacc) ** year, present = ufcf * discount; pv += present; finalFcff = ufcf;
    const revenueFormula = index === 0 ? "Assumptions!$B$3*(1+Assumptions!$B$4)" : `${prior}3*(1+Assumptions!$B$4)`; ([[3, revenueFormula, revenue], [4, `${letter}3*Assumptions!$B$5`, ebitda], [5, `${letter}3*Assumptions!$B$8`, da], [6, `${letter}4-${letter}5`, ebit], [7, `MAX(0,${letter}6*Assumptions!$B$6)`, taxes], [8, `${letter}6-${letter}7`, nopat], [9, `${letter}3*Assumptions!$B$7`, capex], [10, index === 0 ? `${letter}3*Assumptions!$B$9-Assumptions!$B$3*Assumptions!$B$9` : `${letter}3*Assumptions!$B$9-${prior}3*Assumptions!$B$9`, changeNwc], [11, `${letter}8+${letter}5-${letter}9-${letter}10`, ufcf], [12, `1/(1+Assumptions!$B$10)^${year}`, discount], [13, `${letter}11*${letter}12`, present]] as ForecastValue[]).forEach((value) => setForecastFormula(sheet, col, value)); priorNwc = nwc; });
  const terminal = finalFcff * (1 + brief.terminalGrowth) / (brief.wacc - brief.terminalGrowth), pvTerminal = terminal / (1 + brief.wacc) ** brief.years, enterprise = pv + pvTerminal, equity = enterprise - brief.netDebt, perShare = equity / brief.shares;
  [[15, "PV forecast", `SUM(B13:${sheet.getColumn(brief.years + 1).letter}13)`, pv], [16, "Terminal value", `${sheet.getColumn(brief.years + 1).letter}11*(1+Assumptions!$B$11)/(Assumptions!$B$10-Assumptions!$B$11)`, terminal], [17, "PV terminal", `B16/(1+Assumptions!$B$10)^${brief.years}`, pvTerminal], [18, "Enterprise value", "B15+B17", enterprise], [19, "Equity value", "B18-Assumptions!$B$12", equity], [20, "Value per share", "B19/Assumptions!$B$13", perShare]].forEach(([row, label, expression, result]) => { sheet.getCell(row as number, 1).value = label; formula(sheet, `B${row}`, expression as string, result as number); });
  const finalColumn = sheet.getColumn(brief.years + 1).letter;
  sensitivity(sheet, { row: 23, centerX: brief.wacc, centerY: brief.terminalGrowth, evaluate: (wacc, growth) => (pv + finalFcff * (1 + growth) / (wacc - growth) / (1 + wacc) ** brief.years - brief.netDebt) / brief.shares, expression: (x, y) => `(SUM(B13:${finalColumn}13)+${finalColumn}11*(1+${y})/(${x}-${y})/(1+${x})^${brief.years}-Assumptions!$B$12)/Assumptions!$B$13` });
  formatSheet(sheet); return { checks: { terminalSpread: brief.wacc - brief.terminalGrowth, sensitivityCells: 25 }, keyMetric: perShare };
}

function sensitivity(sheet: ExcelJS.Worksheet, options: { row: number; centerX: number; centerY: number; evaluate: (x: number, y: number) => number; expression: (x: string, y: string) => string }): void {
  const { row, centerX, centerY, evaluate, expression } = options;
  sheet.getCell(row, 1).value = "Sensitivity"; const xs = [-0.02, -0.01, 0, 0.01, 0.02].map((delta) => centerX + delta), ys = [-0.01, -0.005, 0, 0.005, 0.01].map((delta) => centerY + delta);
  xs.forEach((value, index) => { sheet.getCell(row, index + 2).value = value; }); ys.forEach((value, y) => { const yRef = `$A${row + y + 1}`; sheet.getCell(row + y + 1, 1).value = value; xs.forEach((x, index) => { const xRef = `${sheet.getColumn(index + 2).letter}$${row}`; formula(sheet, `${sheet.getColumn(index + 2).letter}${row + y + 1}`, expression(xRef, yRef), evaluate(x, value)); }); });
}

function buildLbo(book: ExcelJS.Workbook, brief: Extract<FinanceBrief, { model: "lbo" }>): BuildResult {
  assumptions(book, brief.company, { Revenue: brief.revenue, "Revenue growth": brief.revenueGrowth, "EBITDA margin": brief.ebitdaMargin, "Entry multiple": brief.entryMultiple, "Exit multiple": brief.exitMultiple, "Debt multiple": brief.debtMultiple, "Interest rate": brief.interestRate, "Debt paydown %": brief.debtPaydownPercent, Cash: brief.cash });
  const sheet = book.addWorksheet("LBO"), periods = years(brief.years); title(sheet, `${brief.company} - LBO Model`, brief.years + 1); headers(sheet, 2, ["Line item", ...periods.map((year) => `Year ${year}`)]);
  ["Revenue", "EBITDA", "Opening debt", "Interest", "Debt paydown", "Ending debt"].forEach((label, index) => { sheet.getCell(index + 3, 1).value = label; });
  const entryEbitda = brief.revenue * brief.ebitdaMargin, entryEv = entryEbitda * brief.entryMultiple, debtAtClose = entryEbitda * brief.debtMultiple, sponsor = entryEv - debtAtClose - brief.cash; let revenue = brief.revenue, debt = debtAtClose, finalEbitda = entryEbitda;
  periods.forEach((_, index) => { const col = index + 2, letter = sheet.getColumn(col).letter, prior = sheet.getColumn(col - 1).letter, opening = debt; revenue *= 1 + brief.revenueGrowth; finalEbitda = revenue * brief.ebitdaMargin; const interest = opening * brief.interestRate, paydown = Math.min(opening, Math.max(0, finalEbitda - interest) * brief.debtPaydownPercent); debt -= paydown;
    ([[3, index === 0 ? "Assumptions!$B$3*(1+Assumptions!$B$4)" : `${prior}3*(1+Assumptions!$B$4)`, revenue], [4, `${letter}3*Assumptions!$B$5`, finalEbitda], [5, index === 0 ? "Assumptions!$B$3*Assumptions!$B$5*Assumptions!$B$8" : `${prior}8`, opening], [6, `${letter}5*Assumptions!$B$9`, interest], [7, `MIN(${letter}5,MAX(0,${letter}4-${letter}6)*Assumptions!$B$10)`, paydown], [8, `${letter}5-${letter}7`, debt]] as ForecastValue[]).forEach((value) => setForecastFormula(sheet, col, value)); });
  const exitEv = finalEbitda * brief.exitMultiple, exitEquity = exitEv - debt, moic = exitEquity / sponsor, irr = moic ** (1 / brief.years) - 1;
  [[10, "Entry enterprise value", "Assumptions!$B$3*Assumptions!$B$5*Assumptions!$B$6", entryEv], [11, "Sponsor equity", "B10-Assumptions!$B$3*Assumptions!$B$5*Assumptions!$B$8-Assumptions!$B$11", sponsor], [12, "Exit enterprise value", `${sheet.getColumn(brief.years + 1).letter}4*Assumptions!$B$7`, exitEv], [13, "Exit equity", `B12-${sheet.getColumn(brief.years + 1).letter}8`, exitEquity], [14, "MOIC", "B13/B11", moic], [15, "IRR", `B14^(1/${brief.years})-1`, irr]].forEach(([row, label, expression, result]) => { sheet.getCell(row as number, 1).value = label; formula(sheet, `B${row}`, expression as string, result as number); });
  sensitivity(sheet, { row: 18, centerX: brief.exitMultiple, centerY: brief.revenueGrowth, evaluate: (multiple, growth) => ((brief.revenue * (1 + growth) ** brief.years * brief.ebitdaMargin * multiple - debt) / sponsor) ** (1 / brief.years) - 1, expression: (multiple, growth) => `((Assumptions!$B$3*(1+${growth})^${brief.years}*Assumptions!$B$5*${multiple}-${sheet.getColumn(brief.years + 1).letter}8)/$B$11)^(1/${brief.years})-1` });
  formatSheet(sheet); return { checks: { sourcesUses: entryEv - debtAtClose - sponsor - brief.cash, sensitivityCells: 25 }, keyMetric: irr };
}

function buildComps(book: ExcelJS.Workbook, brief: Extract<FinanceBrief, { model: "comps" }>): BuildResult {
  assumptions(book, brief.company, { "Target revenue": brief.targetRevenue, "Target EBITDA": brief.targetEbitda, "Target net debt": brief.targetNetDebt, "Target shares": brief.targetShares });
  const sheet = book.addWorksheet("Comps"); title(sheet, `${brief.company} - Comparable Companies`, 8); headers(sheet, 2, ["Company", "Enterprise value", "Revenue", "EBITDA", "EV / Revenue", "EV / EBITDA"]);
  const revenueMultiples: number[] = [], ebitdaMultiples: number[] = [];
  brief.comparables.forEach((company, index) => { const row = index + 3, revenueMultiple = company.enterpriseValue / company.revenue, ebitdaMultiple = company.enterpriseValue / company.ebitda; revenueMultiples.push(revenueMultiple); ebitdaMultiples.push(ebitdaMultiple); [company.name, company.enterpriseValue, company.revenue, company.ebitda].forEach((value, column) => { sheet.getCell(row, column + 1).value = value; }); formula(sheet, `E${row}`, `B${row}/C${row}`, revenueMultiple); formula(sheet, `F${row}`, `B${row}/D${row}`, ebitdaMultiple); });
  const row = brief.comparables.length + 4, medianRevenue = median(revenueMultiples), medianEbitda = median(ebitdaMultiples), impliedEv = medianEbitda * brief.targetEbitda, equity = impliedEv - brief.targetNetDebt, perShare = equity / brief.targetShares;
  sheet.getCell(row, 1).value = "Median"; formula(sheet, `E${row}`, `MEDIAN(E3:E${row - 2})`, medianRevenue); formula(sheet, `F${row}`, `MEDIAN(F3:F${row - 2})`, medianEbitda);
  [[row + 2, "Implied EV", `F${row}*Assumptions!$B$4`, impliedEv], [row + 3, "Implied equity", `B${row + 2}-Assumptions!$B$5`, equity], [row + 4, "Implied value / share", `B${row + 3}/Assumptions!$B$6`, perShare]].forEach(([targetRow, label, expression, result]) => { sheet.getCell(targetRow as number, 1).value = label; formula(sheet, `B${targetRow}`, expression as string, result as number); });
  formatSheet(sheet); return { checks: { comparableCount: brief.comparables.length, positiveMedian: medianEbitda }, keyMetric: perShare };
}

function buildMerger(book: ExcelJS.Workbook, brief: Extract<FinanceBrief, { model: "merger" }>): BuildResult {
  assumptions(book, brief.company, { "Acquirer share price": brief.acquirerSharePrice, "Acquirer shares": brief.acquirerShares, "Acquirer net income": brief.acquirerNetIncome, "Target purchase price": brief.targetPurchasePrice, "Target net income": brief.targetNetIncome, "Stock %": brief.stockPercent, Synergies: brief.synergies, "Tax rate": brief.taxRate, "Cash interest rate": brief.cashInterestRate });
  const sheet = book.addWorksheet("Merger"); title(sheet, `${brief.company} - Accretion / Dilution`, 5); headers(sheet, 2, ["Metric", "Formula result"]);
  const stock = brief.targetPurchasePrice * brief.stockPercent, cash = brief.targetPurchasePrice - stock, newShares = stock / brief.acquirerSharePrice, financingCost = cash * brief.cashInterestRate, afterTaxSynergies = brief.synergies * (1 - brief.taxRate), proFormaIncome = brief.acquirerNetIncome + brief.targetNetIncome + afterTaxSynergies - financingCost * (1 - brief.taxRate), proFormaShares = brief.acquirerShares + newShares, standaloneEps = brief.acquirerNetIncome / brief.acquirerShares, proFormaEps = proFormaIncome / proFormaShares, accretion = proFormaEps / standaloneEps - 1;
  const rows: Array<[string, string, number]> = [["Stock consideration", "Assumptions!$B$6*Assumptions!$B$8", stock], ["Cash consideration", "Assumptions!$B$6-B3", cash], ["New shares", "B3/Assumptions!$B$3", newShares], ["After-tax synergies", "Assumptions!$B$9*(1-Assumptions!$B$10)", afterTaxSynergies], ["After-tax financing cost", "B4*Assumptions!$B$11*(1-Assumptions!$B$10)", financingCost * (1 - brief.taxRate)], ["Pro forma net income", "Assumptions!$B$5+Assumptions!$B$7+B6-B7", proFormaIncome], ["Pro forma shares", "Assumptions!$B$4+B5", proFormaShares], ["Standalone EPS", "Assumptions!$B$5/Assumptions!$B$4", standaloneEps], ["Pro forma EPS", "B8/B9", proFormaEps], ["Accretion / dilution", "B11/B10-1", accretion], ["Consideration check", "B3+B4-Assumptions!$B$6", stock + cash - brief.targetPurchasePrice]];
  rows.forEach(([label, expression, result], index) => { const row = index + 3; sheet.getCell(row, 1).value = label; formula(sheet, `B${row}`, expression, result); }); formatSheet(sheet);
  return { checks: { consideration: stock + cash - brief.targetPurchasePrice }, keyMetric: accretion };
}

export function buildFinanceWorkbook(book: ExcelJS.Workbook, brief: FinanceBrief): BuildResult {
  if (brief.model === "three_statement") return buildThreeStatement(book, brief);
  if (brief.model === "dcf") return buildDcf(book, brief);
  if (brief.model === "lbo") return buildLbo(book, brief);
  if (brief.model === "comps") return buildComps(book, brief);
  return buildMerger(book, brief);
}
