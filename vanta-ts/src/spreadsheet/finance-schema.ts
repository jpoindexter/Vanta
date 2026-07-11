import { z } from "zod";

const Name = z.string().trim().min(1).max(120);
const Money = z.number().finite().nonnegative();
const Rate = z.number().finite().min(-1).max(2);
const Positive = z.number().finite().positive();
const Base = z.object({ version: z.literal(1), company: Name, currency: z.string().regex(/^[A-Z]{3}$/), years: z.number().int().min(3).max(10).default(5) });

const Operating = {
  revenue: Positive, revenueGrowth: Rate, ebitdaMargin: Rate, taxRate: z.number().min(0).max(1), capexPercent: z.number().min(0).max(1),
  depreciationPercent: z.number().min(0).max(1), workingCapitalPercent: z.number().min(0).max(1),
};

const ThreeStatement = Base.extend({
  model: z.literal("three_statement"), ...Operating, grossMargin: z.number().min(0).max(1), openingCash: Money, openingDebt: Money,
}).strict();
const Dcf = Base.extend({ model: z.literal("dcf"), ...Operating, wacc: z.number().positive().max(1), terminalGrowth: Rate, netDebt: Money, shares: Positive }).strict();
const Lbo = Base.extend({
  model: z.literal("lbo"), revenue: Positive, revenueGrowth: Rate, ebitdaMargin: Rate, entryMultiple: Positive, exitMultiple: Positive,
  debtMultiple: z.number().min(0).max(20), interestRate: z.number().min(0).max(1), debtPaydownPercent: z.number().min(0).max(1), cash: Money,
}).strict();
const Comparable = z.object({ name: Name, enterpriseValue: Positive, revenue: Positive, ebitda: Positive }).strict();
const Comps = Base.extend({ model: z.literal("comps"), comparables: z.array(Comparable).min(3).max(30), targetRevenue: Positive, targetEbitda: Positive, targetNetDebt: Money, targetShares: Positive }).strict();
const Merger = Base.extend({
  model: z.literal("merger"), acquirerSharePrice: Positive, acquirerShares: Positive, acquirerNetIncome: z.number().finite(), targetPurchasePrice: Positive,
  targetNetIncome: z.number().finite(), stockPercent: z.number().min(0).max(1), synergies: Money, taxRate: z.number().min(0).max(1), cashInterestRate: z.number().min(0).max(1),
}).strict();

export const FinanceBriefSchema = z.discriminatedUnion("model", [ThreeStatement, Dcf, Lbo, Comps, Merger]).superRefine((value, ctx) => {
  if (value.model === "dcf" && value.wacc <= value.terminalGrowth) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "WACC must exceed terminal growth", path: ["wacc"] });
});
export type FinanceBrief = z.infer<typeof FinanceBriefSchema>;
