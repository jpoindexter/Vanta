import { HTTPFacilitatorClient } from "@x402/core/http";
import {
  decodePaymentRequiredHeader,
  decodePaymentResponseHeader,
  encodePaymentSignatureHeader,
} from "@x402/core/http";
import { PaymentPayloadV2Schema, PaymentRequiredV2Schema } from "@x402/core/schemas";
import type { PaymentPayload, PaymentRequired, PaymentRequirements } from "@x402/core/types";
import type { PaymentContract } from "./contract.js";
import { X402_TEST_FACILITATOR, X402_TEST_NETWORKS } from "./contract.js";
import { hashChallenge } from "./ledger.js";
import type { PaymentFetch, ProviderOutcome } from "./providers.js";

type X402Contract = Extract<PaymentContract, { provider: "x402" }>;

export type X402SignerRequest = {
  contractId: string;
  credentialRef: string;
  facilitator: typeof X402_TEST_FACILITATOR;
  requirement: PaymentRequirements;
  resource: { url: string };
};

export type X402Signer = (request: X402SignerRequest) => Promise<PaymentPayload>;

function sameRequirement(left: PaymentRequirements, right: PaymentRequirements): boolean {
  return left.scheme === right.scheme
    && left.network === right.network
    && left.asset === right.asset
    && left.amount === right.amount
    && left.payTo === right.payTo
    && left.maxTimeoutSeconds === right.maxTimeoutSeconds;
}

function matchingRequirement(contract: X402Contract, required: PaymentRequired): PaymentRequirements | null {
  if (required.resource.url !== contract.request.url) return null;
  return required.accepts.find((candidate) =>
    candidate.scheme === contract.request.scheme
      && candidate.network === contract.request.network
      && candidate.asset === contract.request.asset
      && candidate.amount === String(contract.amountMinor)
      && candidate.payTo === contract.request.payTo
  ) ?? null;
}

function requestInit(contract: X402Contract, paymentSignature?: string): RequestInit {
  const headers = new Headers();
  if (contract.request.body !== undefined) headers.set("content-type", "application/json");
  if (paymentSignature) headers.set("payment-signature", paymentSignature);
  return {
    method: contract.request.method,
    body: contract.request.body,
    headers,
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
  };
}

function rejected(state: string, status?: number, challengeHash?: string): ProviderOutcome {
  return {
    ok: false,
    state,
    external: "not_available",
    httpStatus: status,
    challengeHash,
    authorization: { challengeType: "http_402", executionAttempted: false },
  };
}

export async function executeX402(
  contract: X402Contract,
  signer: X402Signer | undefined,
  fetchFn: PaymentFetch = fetch,
): Promise<ProviderOutcome> {
  if (!signer) return rejected("x402_signer_unavailable");

  const challenged = await fetchFn(contract.request.url, requestInit(contract));
  const header = challenged.headers.get("payment-required") ?? "";
  const challengeHash = hashChallenge(header);
  if (challenged.status !== 402 || !header) return rejected("x402_challenge_missing", challenged.status, challengeHash);

  let required: PaymentRequired;
  try {
    required = PaymentRequiredV2Schema.parse(decodePaymentRequiredHeader(header)) as PaymentRequired;
  } catch {
    return rejected("x402_challenge_invalid", challenged.status, challengeHash);
  }
  const requirement = matchingRequirement(contract, required);
  if (!requirement) return rejected("x402_challenge_mismatch", challenged.status, challengeHash);

  let payload: PaymentPayload;
  try {
    payload = PaymentPayloadV2Schema.parse(await signer({
      contractId: contract.id,
      credentialRef: contract.credential.ref,
      facilitator: contract.request.facilitator,
      requirement,
      resource: { url: required.resource.url },
    })) as PaymentPayload;
  } catch {
    return rejected("x402_signing_failed", challenged.status, challengeHash);
  }
  if (payload.resource?.url !== contract.request.url || !sameRequirement(payload.accepted, requirement)) {
    return rejected("x402_signed_payload_mismatch", challenged.status, challengeHash);
  }

  const paid = await fetchFn(contract.request.url, requestInit(contract, encodePaymentSignatureHeader(payload)));
  const responseHeader = paid.headers.get("payment-response") ?? "";
  if (paid.status < 200 || paid.status >= 300 || !responseHeader) {
    return {
      ...rejected("x402_paid_resource_failed", paid.status, challengeHash),
      external: "approved",
      authorization: { challengeType: "http_402", scopedTokenIssued: true, executionAttempted: true },
    };
  }

  try {
    const settled = decodePaymentResponseHeader(responseHeader);
    if (!settled.success
      || settled.network !== requirement.network
      || !settled.transaction
      || (settled.amount !== undefined && settled.amount !== requirement.amount)) {
      return {
        ...rejected("x402_settlement_mismatch", paid.status, challengeHash),
        external: "approved",
        authorization: { challengeType: "http_402", scopedTokenIssued: true, executionAttempted: true },
      };
    }
    return {
      ok: true,
      state: "x402_settled",
      external: "approved",
      providerId: settled.transaction,
      httpStatus: paid.status,
      challengeHash,
      authorization: { challengeType: "http_402", scopedTokenIssued: true, executionAttempted: true },
    };
  } catch {
    return {
      ...rejected("x402_settlement_invalid", paid.status, challengeHash),
      external: "approved",
      authorization: { challengeType: "http_402", scopedTokenIssued: true, executionAttempted: true },
    };
  }
}

export async function probeX402TestnetFacilitator(): Promise<{ ready: boolean; missing: string[] }> {
  const supported = await new HTTPFacilitatorClient({ url: X402_TEST_FACILITATOR }).getSupported();
  const missing = X402_TEST_NETWORKS.filter((network) => !supported.kinds.some((kind) =>
    kind.x402Version === 2 && kind.scheme === "exact" && kind.network === network
  ));
  return { ready: missing.length === 0, missing };
}
