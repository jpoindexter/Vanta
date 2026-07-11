import { describe, expect, it } from "vitest";
import type { RoadmapItem } from "./schema.js";
import { buildUnblockPlans, formatUnblockPlans } from "./unblock.js";

function card(
  id: string,
  status: RoadmapItem["status"],
  title = id,
  parkedReason?: RoadmapItem["parkedReason"],
): RoadmapItem {
  return { id, title, status, track: "Operator", size: "S", summary: "", done: "", parkedReason };
}

describe("roadmap unblock plans", () => {
  it("returns known concrete steps for current Run Anywhere blockers even when parked", () => {
    const plans = buildUnblockPlans([
      card("BACKEND-SERVERLESS-LIVE", "parked", "Serverless"),
      card("RUN-ANYWHERE-TERMUX", "parked", "Termux"),
      card("MSG-ADAPTER-TEAMS", "parked", "Teams"),
    ]);
    const out = formatUnblockPlans(plans);
    expect(out).toContain("vanta backend gateway deploy");
    expect(out).toContain("scripts/termux-arm64-device-proof.sh --require-release-kernel");
    expect(out).toContain("vanta gateway channel-proofs teams");
  });

  it("returns exact host and receipt gates for the parked Hermes and Mercury proofs", () => {
    const out = formatUnblockPlans(buildUnblockPlans([
      card("HERMES-SPREADSHEET-COPILOT", "parked", "Spreadsheet", "external proof"),
      card("MERCURY-CROSS-PLATFORM-SERVICE", "parked", "Service", "external proof"),
      card("HERMES-PAYMENT-SKILL-PACK", "parked", "Payments", "external proof"),
      card("HERMES-SHOPIFY-OPERATIONS", "parked", "Shopify", "external proof"),
      card("HERMES-TELEPHONY-CONSENT-LIFECYCLE", "parked", "Telephony", "external proof"),
      card("HERMES-COMMERCE-TELEPHONY-SKILL-PACK", "parked", "Commerce", "external proof"),
    ]));
    expect(out).toContain("examples/spreadsheet-sidecar/excel-custom-functions.ts");
    expect(out).toContain("service-proof-win32.json");
    expect(out).toContain("VANTA_PAYMENT_TEST_LINK_CLI");
    expect(out).toContain("vanta shopify read");
    expect(out).toContain("vanta telephony ingress");
    expect(out).toContain("Only then execute and ship this aggregate release gate");
  });

  it("includes decision-only horizon cards and explains ratification", () => {
    const [plan] = buildUnblockPlans([card("FUTURE-STRATEGY", "horizon", "Future strategy")]);
    expect(plan?.actions.join("\n")).toContain("explicit strategy decision");
  });

  it("includes parked cards with explicit revive guidance", () => {
    const [plan] = buildUnblockPlans([card("UNKNOWN-PARKED", "parked", "Parked", "review")]);
    expect(plan?.actions.join("\n")).toContain("deliberately parked");
    expect(plan?.actions.join("\n")).toContain("Move it back");
  });

  it("prints the parked reason in the unblock header", () => {
    const out = formatUnblockPlans(buildUnblockPlans([card("NEEDS-PROOF", "parked", "Proof", "external proof")]));
    expect(out).toContain("NEEDS-PROOF (parked · external proof)");
  });

  it("uses parked reason metadata for generic fallback guidance", () => {
    const out = formatUnblockPlans(buildUnblockPlans([
      card("DECLINED", "parked", "Declined", "declined/n-a"),
      card("DUP", "parked", "Duplicate", "duplicate"),
      card("STRAT", "parked", "Strategy", "strategy decision"),
      card("PROOF", "parked", "Proof", "external proof"),
    ]));
    expect(out).toContain("Leave parked unless the architecture or product direction changes");
    expect(out).toContain("Do not build independently");
    expect(out).toContain("Make the strategy decision explicit");
    expect(out).toContain("run the named real-world proof");
  });

  it("filters to requested ids", () => {
    const plans = buildUnblockPlans([
      card("BACKEND-SERVERLESS-LIVE", "blocked"),
      card("RUN-ANYWHERE-TERMUX", "parked"),
    ], ["RUN-ANYWHERE-TERMUX"]);
    expect(plans.map((plan) => plan.id)).toEqual(["RUN-ANYWHERE-TERMUX"]);
  });

  it("orders direct unblock dependencies before the aggregate release gate and decisions", () => {
    const plans = buildUnblockPlans([
      card("RUN-ANYWHERE-V1-RELEASE-GATE", "blocked"),
      card("FUTURE-STRATEGY", "horizon"),
      card("RUN-ANYWHERE-TERMUX", "blocked"),
      card("BACKEND-SERVERLESS-LIVE", "blocked"),
    ]);
    expect(plans.map((plan) => plan.id)).toEqual([
      "BACKEND-SERVERLESS-LIVE",
      "RUN-ANYWHERE-TERMUX",
      "RUN-ANYWHERE-V1-RELEASE-GATE",
      "FUTURE-STRATEGY",
    ]);
  });

  it("reports no match for shipped-only input", () => {
    expect(formatUnblockPlans(buildUnblockPlans([card("DONE", "shipped")]))).toBe("No blocked, parked, or decision-only roadmap cards matched.");
  });
});
