import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = await mkdtemp(join(tmpdir(), "vanta-payment-broker-smoke-"));
const cli = join(repo, "src", "cli.ts");
const loader = join(repo, "node_modules", "tsx", "dist", "loader.mjs");
const id = "pay_region_smoke_1234";
const contractPath = join(root, "payment.json");

await writeFile(contractPath, JSON.stringify({
  version: 1,
  environment: "test",
  id,
  provider: "stripe_link",
  capability: "delegated_fiat",
  merchant: { name: "Regional smoke merchant", url: "https://merchant.example" },
  item: { name: "Regional smoke item", quantity: 1 },
  currency: "eur",
  amountMinor: 100,
  caps: { perPurchaseMinor: 100, periodMinor: 100, period: "day" },
  credential: { type: "link_cli", storage: "provider_cli" },
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
}), "utf8");

const env = {
  ...process.env,
  VANTA_HOME: join(root, "home"),
  VANTA_PROJECT_ROOT: root,
  VANTA_PAYMENT_REGION: "ES",
  VANTA_PAYMENT_TEST_LINK_CLI: "/usr/bin/false",
};
const run = (args) => spawnSync(process.execPath, ["--import", loader, cli, ...args], {
  cwd: root,
  env,
  encoding: "utf8",
});

const execution = run(["payments", "execute", "payment.json", "--approve", id]);
if (execution.status !== 1 || !execution.stdout.includes("payment stopped: unsupported_region")) {
  throw new Error(`regional stop failed: ${execution.status}\n${execution.stdout}\n${execution.stderr}`);
}
const authorization = await readFile(join(root, ".vanta", "payments", "authorization.jsonl"), "utf8");
const receipts = await readFile(join(root, ".vanta", "payments", "receipts.jsonl"), "utf8");
const phases = authorization.trim().split("\n").map((line) => JSON.parse(line).phase);
if (JSON.stringify(phases) !== JSON.stringify(["previewed", "operator_approved", "stopped", "receipt_recorded"])) {
  throw new Error(`unexpected authorization phases: ${JSON.stringify(phases)}`);
}
if (!receipts.includes('"state":"unsupported_region"') || receipts.includes("/usr/bin/false")) {
  throw new Error("regional receipt was missing or leaked adapter configuration");
}

const readiness = run(["payments", "readiness", "--json"]);
if (readiness.status !== 0 || !readiness.stdout.includes('"state": "unsupported_region"')) {
  throw new Error(`readiness command failed: ${readiness.status}\n${readiness.stdout}\n${readiness.stderr}`);
}
console.log("PAYMENT_AUTHORIZATION_BROKER_SMOKE_OK");
