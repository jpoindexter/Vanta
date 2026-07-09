import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import { slugify } from "../brain/vault-bridge.js";

export const ClaimReceiptSchema = z.object({
  claim: z.string().min(1),
  source: z.string().min(1).optional(),
  date: z.string().min(1).optional(),
  expiry: z.string().min(1).optional(),
});
export type ClaimReceipt = z.infer<typeof ClaimReceiptSchema>;
export type ReceiptVerdict = ClaimReceipt & { status: "survives" | "rejected"; flags: string[] };

export const ReceiptInputSchema = z.union([
  z.array(ClaimReceiptSchema),
  z.object({ objective: z.string().optional(), claims: z.array(ClaimReceiptSchema) }),
]);

export type ReceiptReport = { objective: string; verdicts: ReceiptVerdict[]; survivors: ReceiptVerdict[] };

const SKEPTIC_TERMS = /\b(always|guaranteed|impossible|never|proves?|best|only)\b/i;

export function assessReceipts(claims: ClaimReceipt[], opts: { now?: Date; objective?: string } = {}): ReceiptReport {
  const now = opts.now ?? new Date();
  const verdicts = claims.map((claim) => verdict(claim, now));
  return {
    objective: opts.objective ?? "research receipts",
    verdicts,
    survivors: verdicts.filter((v) => v.status === "survives"),
  };
}

export async function readReceiptInput(file: string): Promise<{ objective: string; claims: ClaimReceipt[] }> {
  const parsed = ReceiptInputSchema.parse(JSON.parse(await readFile(file, "utf8")));
  return Array.isArray(parsed)
    ? { objective: "research receipts", claims: parsed }
    : { objective: parsed.objective ?? "research receipts", claims: parsed.claims };
}

export function formatReceiptReport(report: ReceiptReport): string {
  const lines = [`Research receipts: ${report.objective}`, `survivors: ${report.survivors.length}/${report.verdicts.length}`, ""];
  for (const v of report.verdicts) {
    lines.push(`- ${v.status}: ${v.claim}`);
    lines.push(`  source: ${v.source ?? "(missing)"} · date: ${v.date ?? "(missing)"} · expiry: ${v.expiry ?? "(missing)"}`);
    if (v.flags.length) lines.push(`  flags: ${v.flags.join("; ")}`);
  }
  return lines.join("\n");
}

export async function writeReceiptVault(vault: string, report: ReceiptReport): Promise<string> {
  const rel = join("wiki", "research", `${slugify(report.objective)}.md`);
  const body = [
    "---",
    "type: research-receipts",
    "source: research-receipts-skeptic",
    "---",
    "",
    `# ${report.objective}`,
    "",
    "## Surviving Claims",
    ...(report.survivors.length ? report.survivors.map((v) => `- ${v.claim} ([source](${v.source})) · date ${v.date} · expires ${v.expiry}`) : ["- none"]),
    "",
    "## Rejected Claims",
    ...report.verdicts.filter((v) => v.status === "rejected").map((v) => `- ${v.claim} — ${v.flags.join("; ")}`),
    "",
  ].join("\n");
  await mkdir(dirname(join(vault, rel)), { recursive: true });
  await writeFile(join(vault, rel), body, "utf8");
  return rel;
}

function verdict(claim: ClaimReceipt, now: Date): ReceiptVerdict {
  const flags = [...missingFlags(claim), ...dateFlags(claim, now), ...skepticFlags(claim)];
  return { ...claim, status: flags.length ? "rejected" : "survives", flags };
}

function missingFlags(claim: ClaimReceipt): string[] {
  return [
    !claim.source ? "unsupported: missing source" : "",
    !claim.date ? "unsupported: missing date" : "",
    !claim.expiry ? "unsupported: missing expiry" : "",
  ].filter(Boolean);
}

function dateFlags(claim: ClaimReceipt, now: Date): string[] {
  return [
    claim.date && invalidOrFuture(claim.date, now) ? "bad date: invalid or future-dated" : "",
    claim.expiry && expired(claim.expiry, now) ? "stale: expiry has passed" : "",
  ].filter(Boolean);
}

function skepticFlags(claim: ClaimReceipt): string[] {
  const grounded = /\baccording to|measured|observed|reported|benchmark\b/i.test(claim.claim);
  return SKEPTIC_TERMS.test(claim.claim) && !grounded ? ["skeptic: strong wording needs direct evidence"] : [];
}

function expired(iso: string, now: Date): boolean {
  const t = new Date(iso).getTime();
  return !Number.isFinite(t) || t < now.getTime();
}

function invalidOrFuture(iso: string, now: Date): boolean {
  const t = new Date(iso).getTime();
  return !Number.isFinite(t) || t > now.getTime();
}
