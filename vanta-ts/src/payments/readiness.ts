import type { PaymentCapability, PaymentContract } from "./contract.js";

export const PAYMENT_RAILS = ["stripe_link", "mpp", "adyen_agentic", "x402", "visa_tap"] as const;
export type PaymentRail = typeof PAYMENT_RAILS[number];
export type PaymentChallengeType = "provider_step_up" | "http_402" | "sca_3ds" | "wallet_signature" | "signed_agent_intent";
export type PaymentProviderState = "ready" | "unsupported_region" | "enrollment_required" | "unavailable";

export type PaymentProviderReadiness = {
  provider: PaymentRail;
  capability: PaymentCapability;
  region: string;
  supportedRegions: string[] | "provider_managed" | "testnet";
  testAvailability: "available" | "configured" | "unavailable";
  liveAvailability: "disabled" | "enrollment_required";
  externalEnrollment: "required" | "configured" | "not_required" | "not_available";
  credentialCustody: "provider_cli" | "provider_token" | "vault_signer" | "scheme_registry";
  challengeType: PaymentChallengeType;
  state: PaymentProviderState;
  reason: string;
};

type RailDefinition = Omit<PaymentProviderReadiness, "region" | "state" | "reason" | "testAvailability" | "externalEnrollment"> & {
  configuredBy?: string;
  enrollment: PaymentProviderReadiness["externalEnrollment"];
};

const RAILS: Record<PaymentRail, RailDefinition> = {
  stripe_link: {
    provider: "stripe_link", capability: "delegated_fiat", supportedRegions: ["US"],
    liveAvailability: "enrollment_required", credentialCustody: "provider_cli", challengeType: "provider_step_up",
    configuredBy: "VANTA_PAYMENT_TEST_LINK_CLI", enrollment: "required",
  },
  mpp: {
    provider: "mpp", capability: "http_402", supportedRegions: ["US"],
    liveAvailability: "enrollment_required", credentialCustody: "provider_cli", challengeType: "http_402",
    configuredBy: "VANTA_PAYMENT_TEST_LINK_CLI", enrollment: "required",
  },
  adyen_agentic: {
    provider: "adyen_agentic", capability: "delegated_fiat", supportedRegions: "provider_managed",
    liveAvailability: "enrollment_required", credentialCustody: "provider_token", challengeType: "sca_3ds",
    enrollment: "required",
  },
  x402: {
    provider: "x402", capability: "http_402", supportedRegions: "testnet",
    liveAvailability: "disabled", credentialCustody: "vault_signer", challengeType: "wallet_signature",
    enrollment: "not_required",
  },
  visa_tap: {
    provider: "visa_tap", capability: "merchant_recognition", supportedRegions: "provider_managed",
    liveAvailability: "enrollment_required", credentialCustody: "scheme_registry", challengeType: "signed_agent_intent",
    enrollment: "required",
  },
};

function currentRegion(env: NodeJS.ProcessEnv): string {
  return env.VANTA_PAYMENT_REGION?.trim().toUpperCase() || "unknown";
}

export function paymentProviderReadiness(
  provider: PaymentRail,
  env: NodeJS.ProcessEnv = process.env,
): PaymentProviderReadiness {
  const definition = RAILS[provider];
  const { configuredBy, enrollment, ...report } = definition;
  const region = currentRegion(env);
  const regionBlocked = Array.isArray(definition.supportedRegions)
    && region !== "unknown"
    && !definition.supportedRegions.includes(region);
  const configured = Boolean(configuredBy && env[configuredBy]);
  const implemented = provider === "stripe_link" || provider === "mpp";

  let state: PaymentProviderState = "ready";
  let reason = "test rail is configured";
  if (regionBlocked) {
    state = "unsupported_region";
    reason = `${provider} is not available in region ${region}`;
  } else if (!implemented) {
    state = "unavailable";
    reason = `${provider} adapter is not implemented`;
  } else if (!configured) {
    state = "enrollment_required";
    reason = `${configuredBy} is not configured`;
  }

  return {
    ...report,
    region,
    testAvailability: configured && implemented ? "configured" : implemented ? "available" : "unavailable",
    externalEnrollment: enrollment,
    state,
    reason,
  };
}

export function listPaymentProviderReadiness(env: NodeJS.ProcessEnv = process.env): PaymentProviderReadiness[] {
  return PAYMENT_RAILS.map((provider) => paymentProviderReadiness(provider, env));
}

export function readinessForContract(
  contract: PaymentContract,
  env: NodeJS.ProcessEnv = process.env,
): PaymentProviderReadiness | null {
  if (contract.provider === "stripe_projects") return null;
  return paymentProviderReadiness(contract.provider, env);
}
