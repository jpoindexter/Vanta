import { describe, expect, it } from "vitest";
import { listPaymentProviderReadiness, paymentProviderReadiness } from "./readiness.js";

describe("payment provider readiness", () => {
  it("reports region, enrollment, custody, challenge, and test/live availability", () => {
    expect(paymentProviderReadiness("stripe_link", {
      VANTA_PAYMENT_REGION: "US", VANTA_PAYMENT_TEST_LINK_CLI: "/tmp/link-fixture",
    })).toMatchObject({
      capability: "delegated_fiat", region: "US", supportedRegions: ["US"], state: "ready",
      testAvailability: "configured", liveAvailability: "enrollment_required",
      externalEnrollment: "required", credentialCustody: "provider_cli", challengeType: "provider_step_up",
    });
  });

  it("stops unsupported regions before enrollment checks", () => {
    expect(paymentProviderReadiness("stripe_link", {
      VANTA_PAYMENT_REGION: "ES", VANTA_PAYMENT_TEST_LINK_CLI: "/tmp/link-fixture",
    })).toMatchObject({ state: "unsupported_region", region: "ES" });
  });

  it("names future rails as unavailable instead of pretending they are configured", () => {
    const readiness = listPaymentProviderReadiness({ VANTA_PAYMENT_REGION: "ES" });
    expect(readiness.map((item) => item.provider)).toEqual(["stripe_link", "mpp", "adyen_agentic", "x402", "visa_tap"]);
    expect(readiness.find((item) => item.provider === "x402")).toMatchObject({
      capability: "http_402", state: "ready", supportedRegions: "testnet", testAvailability: "available",
    });
  });
});
