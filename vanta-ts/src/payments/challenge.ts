import type { PaymentContract } from "./contract.js";

export type PaymentChallenge = {
  scheme: string;
  amountMinor: number;
  currency: string;
  method?: string;
  resource?: string;
  merchant?: string;
  item?: string;
  expiresAt?: string;
};

export type ChallengeResult =
  | { ok: true; challenge: PaymentChallenge }
  | { ok: false; error: string };

function parameters(value: string): Record<string, string> {
  const found: Record<string, string> = {};
  const pattern = /([a-zA-Z][a-zA-Z0-9_-]*)=(?:"([^"]*)"|([^,\s]+))/g;
  for (const match of value.matchAll(pattern)) {
    const key = match[1]?.toLowerCase();
    const entry = match[2] ?? match[3];
    if (key && entry !== undefined) found[key] = entry;
  }
  return found;
}

function decimalToMinor(value: string, exponent: number): number | null {
  if (!/^\d+(?:\.\d+)?$/.test(value)) return null;
  const [whole = "0", fraction = ""] = value.split(".");
  if (fraction.length > exponent) return null;
  const combined = `${whole}${fraction.padEnd(exponent, "0")}`.replace(/^0+(?=\d)/, "");
  const amount = Number(combined || "0");
  return Number.isSafeInteger(amount) ? amount : null;
}

function bodyParameters(body: string | undefined): Record<string, string> {
  if (!body) return {};
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    const source = typeof parsed.payment === "object" && parsed.payment ? parsed.payment as Record<string, unknown> : parsed;
    return Object.fromEntries(Object.entries(source).filter(([, value]) => ["string", "number"].includes(typeof value)).map(([key, value]) => [key.toLowerCase(), String(value)]));
  } catch { return {}; }
}

function headerValue(headers: Headers | Record<string, string>, name: string): string | undefined {
  if (headers instanceof Headers) return headers.get(name) ?? undefined;
  const found = Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase());
  return found?.[1];
}

function challengeAmount(values: Record<string, string>, exponent: number): number | null {
  const minor = values.amount_minor ?? values.amountminor;
  if (minor !== undefined) return /^\d+$/.test(minor) ? Number(minor) : null;
  return decimalToMinor(values.amount ?? "", exponent);
}

export function parsePaymentChallenge(
  status: number,
  headers: Headers | Record<string, string>,
  body: string | undefined,
  exponent: number,
): ChallengeResult {
  if (status !== 402) return { ok: false, error: `expected HTTP 402, received ${status}` };
  const header = headerValue(headers, "www-authenticate") ?? "";
  const values = { ...bodyParameters(body), ...parameters(header) };
  const currency = values.currency?.toLowerCase();
  const amount = challengeAmount(values, exponent);
  if (!header.trim()) return { ok: false, error: "HTTP 402 missing WWW-Authenticate challenge" };
  if (!currency) return { ok: false, error: "payment challenge missing currency" };
  if (amount === null || amount === undefined || !Number.isSafeInteger(amount)) return { ok: false, error: "payment challenge has invalid amount" };
  const scheme = header.trim().split(/\s+/, 1)[0]?.toLowerCase() ?? "payment";
  return { ok: true, challenge: {
    scheme, amountMinor: amount, currency,
    method: values.method?.toLowerCase(), resource: values.resource,
    merchant: values.merchant, item: values.item,
    expiresAt: values.expires ?? values.expiresat,
  } };
}

export function validatePaymentChallenge(
  contract: Extract<PaymentContract, { provider: "mpp" }>,
  challenge: PaymentChallenge,
  now = new Date(),
): string[] {
  const checks: Array<[boolean, string]> = [
    [challenge.amountMinor !== contract.amountMinor, "challenge amount does not match exact total"],
    [challenge.currency !== contract.currency, "challenge currency does not match contract"],
    [challenge.method !== "stripe", "challenge does not authorize Stripe Link"],
    [Boolean(challenge.resource && challenge.resource !== contract.request.url), "challenge resource does not match request URL"],
    [Boolean(challenge.merchant && challenge.merchant !== contract.merchant.name), "challenge merchant does not match contract"],
    [Boolean(challenge.item && challenge.item !== contract.item.name), "challenge item does not match contract"],
    [Boolean(challenge.expiresAt && Date.parse(challenge.expiresAt) <= now.getTime()), "payment challenge expired"],
  ];
  return checks.filter(([failed]) => failed).map(([, message]) => message);
}
