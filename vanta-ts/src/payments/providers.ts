import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { PaymentContract } from "./contract.js";
import { hashChallenge } from "./ledger.js";
import { parsePaymentChallenge, validatePaymentChallenge } from "./challenge.js";
import type { PaymentChallengeType } from "./readiness.js";

export type PaymentCommandResult = { code: number; stdout: string; stderr: string };
export type PaymentCommandRunner = (command: string, args: string[], timeoutMs: number) => Promise<PaymentCommandResult>;
export type PaymentFetch = (input: string, init: RequestInit) => Promise<Response>;
export type ProviderOutcome = {
  ok: boolean; state: string; external: "approved" | "denied" | "timeout" | "not_available";
  providerId?: string; httpStatus?: number; challengeHash?: string;
  authorization?: {
    challengeType?: PaymentChallengeType;
    scopedTokenIssued?: boolean;
    executionAttempted?: boolean;
  };
};

export function paymentCommandEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const names = ["PATH", "HOME", "USER", "TMPDIR", "LANG", "LC_ALL", "XDG_CONFIG_HOME"];
  return Object.fromEntries(names.flatMap((name) => env[name] === undefined ? [] : [[name, env[name]]])) as NodeJS.ProcessEnv;
}

export const livePaymentCommand: PaymentCommandRunner = async (_command, args, timeoutMs) => {
  const command = process.env.VANTA_PAYMENT_TEST_LINK_CLI;
  if (!command) return { code: 127, stdout: "", stderr: "test payment adapter is not configured" };
  try {
    const result = await promisify(execFile)(command, args, { timeout: timeoutMs, maxBuffer: 1024 * 1024, env: paymentCommandEnv(process.env) });
    return { code: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const failure = error as Error & { code?: number; stdout?: string; stderr?: string };
    return { code: typeof failure.code === "number" ? failure.code : 1, stdout: failure.stdout ?? "", stderr: failure.stderr ?? failure.message };
  }
};

function parseJson(raw: string): unknown {
  try { return JSON.parse(raw); } catch { return null; }
}

function findString(value: unknown, keys: ReadonlySet<string>): string | undefined {
  const queue: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.depth > 5 || !current.value || typeof current.value !== "object") continue;
    const entries = Array.isArray(current.value)
      ? current.value.map((entry) => ["", entry] as const)
      : Object.entries(current.value);
    const found = entries.find(([key, entry]) => keys.has(key.toLowerCase()) && ["string", "number"].includes(typeof entry));
    if (found) return String(found[1]);
    queue.push(...entries.map(([, entry]) => ({ value: entry, depth: current.depth + 1 })));
  }
  return undefined;
}

function deniedState(stderr: string): Pick<ProviderOutcome, "state" | "external"> {
  if (/timeout|timed out/i.test(stderr)) return { state: "external_approval_timeout", external: "timeout" };
  return { state: "external_approval_denied", external: "denied" };
}

async function defaultPaymentMethod(run: PaymentCommandRunner): Promise<string | null> {
  const result = await run("link-cli", ["payment-methods", "list", "--format", "json"], 30_000);
  if (result.code !== 0) return null;
  const id = findString(parseJson(result.stdout), new Set(["id", "payment_method_id"]));
  return id?.startsWith("pm_") ? id : null;
}

async function createLinkSpend(
  contract: Extract<PaymentContract, { provider: "stripe_link" | "mpp" }>,
  type: "card" | "shared_payment_token",
  run: PaymentCommandRunner,
): Promise<ProviderOutcome> {
  const paymentMethod = await defaultPaymentMethod(run);
  if (!paymentMethod) return { ok: false, state: "payment_method_unavailable", external: "not_available" };
  const args = [
    "spend-request", "create", "--payment-method-id", paymentMethod,
    "--merchant-name", contract.merchant.name, "--merchant-url", contract.merchant.url,
    "--context", contract.item.name, "--amount", String(contract.amountMinor),
    "--line-item", `name:${contract.item.name},unit_amount:${contract.amountMinor},quantity:1`,
    "--total", `type:total,display_text:Total,amount:${contract.amountMinor}`,
    "--credential-type", type, "--request-approval", "--format", "json",
  ];
  const result = await run("link-cli", args, 310_000);
  const authorization = { challengeType: "provider_step_up" as const };
  if (result.code !== 0) return { ok: false, ...deniedState(result.stderr), authorization };
  const data = parseJson(result.stdout);
  const id = findString(data, new Set(["id", "spend_request_id"]));
  const status = findString(data, new Set(["status", "approval_status"]))?.toLowerCase();
  const approved = ["approved", "authorized", "complete", "completed"].includes(status ?? "");
  if (!id?.startsWith("lsrq_") || !approved) return { ok: false, state: "invalid_provider_result", external: status === "denied" ? "denied" : "not_available", authorization };
  return {
    ok: true, state: "spend_approved", external: "approved", providerId: id,
    authorization: { ...authorization, scopedTokenIssued: true, executionAttempted: true },
  };
}

export function executeStripeLink(
  contract: Extract<PaymentContract, { provider: "stripe_link" }>,
  run: PaymentCommandRunner = livePaymentCommand,
): Promise<ProviderOutcome> {
  return createLinkSpend(contract, "card", run);
}

async function boundedBody(response: Response, limit = 65_536): Promise<string> {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > limit) throw new Error("payment challenge body exceeds limit");
  const text = await response.text();
  if (Buffer.byteLength(text) > limit) throw new Error("payment challenge body exceeds limit");
  return text;
}

async function payMpp(
  contract: Extract<PaymentContract, { provider: "mpp" }>,
  spend: ProviderOutcome,
  run: PaymentCommandRunner,
): Promise<ProviderOutcome> {
  const args = ["mpp", "pay", contract.request.url, "--spend-request-id", spend.providerId!, "--method", contract.request.method, "--format", "json"];
  if (contract.request.body !== undefined) args.push("--data", contract.request.body);
  const result = await run("link-cli", args, 60_000);
  const authorization = { challengeType: "http_402" as const, scopedTokenIssued: true, executionAttempted: true };
  if (result.code !== 0) return { ok: false, state: "mpp_payment_failed", external: "approved", providerId: spend.providerId, authorization };
  const status = Number(findString(parseJson(result.stdout), new Set(["status_code", "http_status", "status"])) ?? 200);
  return { ok: status >= 200 && status < 300, state: status >= 200 && status < 300 ? "mpp_settled" : "mpp_response_failed", external: "approved", providerId: spend.providerId, httpStatus: status, authorization };
}

export async function executeMpp(
  contract: Extract<PaymentContract, { provider: "mpp" }>,
  run: PaymentCommandRunner = livePaymentCommand,
  fetchFn: PaymentFetch = fetch,
  now = new Date(),
): Promise<ProviderOutcome> {
  const response = await fetchFn(contract.request.url, { method: contract.request.method, body: contract.request.body, redirect: "manual", signal: AbortSignal.timeout(15_000) });
  const body = await boundedBody(response);
  const header = response.headers.get("www-authenticate") ?? "";
  const parsed = parsePaymentChallenge(response.status, response.headers, body, contract.currencyExponent);
  const challenged = { challengeType: "http_402" as const };
  if (!parsed.ok) return { ok: false, state: "challenge_rejected", external: "not_available", httpStatus: response.status, challengeHash: hashChallenge(header), authorization: challenged };
  if (validatePaymentChallenge(contract, parsed.challenge, now).length > 0) return { ok: false, state: "challenge_mismatch", external: "not_available", httpStatus: response.status, challengeHash: hashChallenge(header), authorization: challenged };
  const spend = await createLinkSpend(contract, "shared_payment_token", run);
  if (!spend.ok) return { ...spend, challengeHash: hashChallenge(header), httpStatus: response.status, authorization: challenged };
  return { ...(await payMpp(contract, spend, run)), challengeHash: hashChallenge(header) };
}
