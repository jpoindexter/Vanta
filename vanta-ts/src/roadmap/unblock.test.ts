import { describe, expect, it } from "vitest";
import type { RoadmapItem } from "./schema.js";
import { buildUnblockPlans, formatUnblockPlans } from "./unblock.js";

function card(id: string, status: RoadmapItem["status"], title = id): RoadmapItem {
  return { id, title, status, track: "Operator", size: "S", summary: "", done: "" };
}

describe("roadmap unblock plans", () => {
  it("returns known concrete steps for current Run Anywhere blockers", () => {
    const plans = buildUnblockPlans([
      card("BACKEND-SERVERLESS-LIVE", "blocked", "Serverless"),
      card("RUN-ANYWHERE-TERMUX", "blocked", "Termux"),
      card("MSG-ADAPTER-TEAMS", "blocked", "Teams"),
    ]);
    const out = formatUnblockPlans(plans);
    expect(out).toContain("vanta backend gateway deploy");
    expect(out).toContain("scripts/termux-arm64-device-proof.sh --require-release-kernel");
    expect(out).toContain("vanta gateway channel-proofs teams");
  });

  it("includes decision-only horizon cards and explains ratification", () => {
    const [plan] = buildUnblockPlans([card("PCLIP-MULTI-USER", "horizon", "Multi user")]);
    expect(plan?.actions.join("\n")).toContain("Ratify multiple human supervisors");
  });

  it("filters to requested ids", () => {
    const plans = buildUnblockPlans([
      card("BACKEND-SERVERLESS-LIVE", "blocked"),
      card("RUN-ANYWHERE-TERMUX", "blocked"),
    ], ["RUN-ANYWHERE-TERMUX"]);
    expect(plans.map((plan) => plan.id)).toEqual(["RUN-ANYWHERE-TERMUX"]);
  });

  it("orders direct unblock dependencies before the aggregate release gate and decisions", () => {
    const plans = buildUnblockPlans([
      card("RUN-ANYWHERE-V1-RELEASE-GATE", "blocked"),
      card("PCLIP-MULTI-USER", "horizon"),
      card("RUN-ANYWHERE-TERMUX", "blocked"),
      card("BACKEND-SERVERLESS-LIVE", "blocked"),
    ]);
    expect(plans.map((plan) => plan.id)).toEqual([
      "BACKEND-SERVERLESS-LIVE",
      "RUN-ANYWHERE-TERMUX",
      "RUN-ANYWHERE-V1-RELEASE-GATE",
      "PCLIP-MULTI-USER",
    ]);
  });

  it("reports no match for shipped-only input", () => {
    expect(formatUnblockPlans(buildUnblockPlans([card("DONE", "shipped")]))).toBe("No blocked or decision-only roadmap cards matched.");
  });
});
