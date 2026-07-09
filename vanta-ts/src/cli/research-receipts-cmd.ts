import {
  assessReceipts,
  formatReceiptReport,
  readReceiptInput,
  writeReceiptVault,
} from "../solutioning/research-receipts.js";

export async function runResearchReceiptsCommand(rest: string[]): Promise<number> {
  const file = rest[0];
  if (!file) {
    console.error("usage: vanta research-receipts <claims.json> [--vault <dir> --apply]");
    return 1;
  }
  const vaultIdx = rest.indexOf("--vault");
  const vault = vaultIdx === -1 ? null : rest[vaultIdx + 1];
  const input = await readReceiptInput(file);
  const report = assessReceipts(input.claims, { objective: input.objective });
  console.log(formatReceiptReport(report));
  if (vault && rest.includes("--apply")) {
    console.log(`vault: ${await writeReceiptVault(vault, report)}`);
  } else if (vault) {
    console.log(`vault: dry-run (${report.survivors.length} surviving claim(s) would write)`);
  }
  return report.survivors.length === 0 && report.verdicts.length > 0 ? 2 : 0;
}
