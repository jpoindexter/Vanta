import { readFile } from "node:fs/promises";
import { resolveInScope } from "../scope.js";
import { PaymentContractSchema } from "../payments/contract.js";
import { loadPaymentReceipts } from "../payments/ledger.js";
import { executePayment, previewPayment, type PaymentProvider } from "../payments/service.js";

const USAGE = "usage: vanta payments preview <contract.json> | execute <contract.json> --approve <transaction-id> | receipts";
type Deps = { log?: (line: string) => void; now?: () => Date; provider?: PaymentProvider };

async function readContract(root: string, path: string) {
  const scoped = resolveInScope(path, root);
  if (!scoped.ok) throw new Error(`contract outside project: ${path}`);
  return PaymentContractSchema.parse(JSON.parse(await readFile(scoped.path, "utf8")));
}

function approvalToken(args: string[]): string | undefined {
  const index = args.indexOf("--approve");
  return index >= 0 ? args[index + 1] : undefined;
}

async function listReceipts(root: string, log: (line: string) => void): Promise<number> {
  const receipts = await loadPaymentReceipts(root);
  for (const receipt of receipts) log(`${receipt.at}\t${receipt.transactionId}\t${receipt.status}\t${receipt.amountMinor} ${receipt.currency}\t${receipt.providerResult.state}`);
  if (receipts.length === 0) log("no payment receipts");
  return 0;
}

async function runContractAction(root: string, path: string, options: {
  action: "preview" | "execute"; args: string[]; deps: Deps; log: (line: string) => void;
}): Promise<number> {
  const contract = await readContract(root, path);
  const preview = await previewPayment(root, contract, (options.deps.now ?? (() => new Date()))());
  options.log(preview.preview);
  if (options.action === "preview") {
    if (!preview.assessment.ok) options.log(`blocked: ${preview.assessment.issues.join("; ")}`);
    return preview.assessment.ok ? 0 : 1;
  }
  if (approvalToken(options.args) !== contract.id) { options.log(`not executed; rerun with --approve ${contract.id} after reviewing this exact transaction`); return 1; }
  const result = await executePayment(root, contract, { approve: async () => true, provider: options.deps.provider, now: options.deps.now });
  options.log(result.ok ? `payment ${result.state}; redacted receipt recorded` : `payment stopped: ${result.state}`);
  return result.ok ? 0 : 1;
}

export async function runPaymentsCommand(root: string, args: string[], deps: Deps = {}): Promise<number> {
  const log = deps.log ?? console.log;
  const [action, path] = args;
  try {
    if (action === "receipts") return await listReceipts(root, log);
    if (!path || !["preview", "execute"].includes(action ?? "")) { log(USAGE); return 1; }
    return await runContractAction(root, path, { action: action as "preview" | "execute", args, deps, log });
  } catch { log("payment error: invalid contract, secure ledger, or provider state"); return 1; }
}
