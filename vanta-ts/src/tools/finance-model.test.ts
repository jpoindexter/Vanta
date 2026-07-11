import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { financeModelTool } from "./finance-model.js";
import type { ToolContext } from "./types.js";

const brief = { version: 1, model: "dcf", company: "Acme", currency: "USD", years: 5, revenue: 1000, revenueGrowth: 0.08, ebitdaMargin: 0.22, taxRate: 0.25, capexPercent: 0.05, depreciationPercent: 0.04, workingCapitalPercent: 0.1, wacc: 0.1, terminalGrowth: 0.025, netDebt: 150, shares: 100 };

describe("finance_model tool", () => {
  it("previews without approval and generates only after approval", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-finance-tool-")), requestApproval = vi.fn(async () => true), ctx = { root, safety: {} as ToolContext["safety"], requestApproval };
    const preview = await financeModelTool.execute({ action: "preview", path: "models/dcf.xlsx", brief }, ctx); expect(preview).toMatchObject({ ok: true }); expect(preview.output).toContain("model: dcf"); expect(requestApproval).not.toHaveBeenCalled();
    const generated = await financeModelTool.execute({ action: "generate", path: "models/dcf.xlsx", brief }, ctx); expect(generated).toMatchObject({ ok: true }); expect(generated.output).toContain("verified"); expect(requestApproval).toHaveBeenCalledWith(expect.stringContaining("Acme"), expect.any(String), "finance_model", expect.any(Object));
  });

  it("leaves no workbook when approval is denied", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-finance-tool-")), ctx = { root, safety: {} as ToolContext["safety"], requestApproval: vi.fn(async () => false) };
    expect(await financeModelTool.execute({ action: "generate", path: "dcf.xlsx", brief }, ctx)).toMatchObject({ ok: false, output: expect.stringContaining("denied") });
  });
});
