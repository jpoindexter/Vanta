import type { RoadmapItem } from "./schema.js";

type UnblockPlan = {
  id: string;
  title: string;
  status: RoadmapItem["status"];
  actions: string[];
};

const KNOWN_ACTIONS: Record<string, string[]> = {
  "BACKEND-SERVERLESS-LIVE": [
    "Create the Modal secret explicitly; Vanta will not copy local keys.",
    "Set VANTA_TELEGRAM_TOKEN and VANTA_TELEGRAM_WEBHOOK_SECRET.",
    "Run `vanta backend gateway deploy`, then `vanta backend gateway register-telegram`.",
    "Arm and prove the live wake path: `vanta backend gateway arm`, send the bot a message, then `vanta backend gateway prove`.",
  ],
  "MSG-ADAPTER-TEAMS": [
    "Provide Azure Bot app id/client secret and a public HTTPS endpoint.",
    "Install the Teams app and send an allowlisted real Teams message.",
    "Require `vanta gateway channel-proofs teams` to show an accepted real-service receipt.",
  ],
  "RUN-ANYWHERE-TERMUX": [
    "Approve/publish a release that includes `vanta-kernel-aarch64-linux-android` plus its `.sha256`.",
    "On a physical ARM64 Android/Termux device, run `scripts/termux-arm64-device-proof.sh --require-release-kernel`.",
    "Keep blocked until the real device proof reaches TERMUX_ARM64_E2E_OK.",
  ],
  "RUN-ANYWHERE-V1-RELEASE-GATE": [
    "Ship BACKEND-SERVERLESS-LIVE with a real remote wake/reply/scaledown proof.",
    "Ship MSG-ADAPTER-TEAMS with a real Azure/Teams round trip.",
    "Ship RUN-ANYWHERE-TERMUX with a physical ARM64 release-kernel proof.",
  ],
  "PCLIP-MULTI-COMPANY": [
    "Ratify a strategy change away from the current single-operator/local-first direction.",
    "Only then move the card out of horizon and decompose isolation, audit, and data-boundary work.",
  ],
  "PCLIP-MULTI-USER": [
    "Ratify multiple human supervisors as an intentional product direction.",
    "Only then move the card out of horizon and decompose roles, invites, board access, and run credentials.",
  ],
};

const PLAN_ORDER = [
  "BACKEND-SERVERLESS-LIVE",
  "MSG-ADAPTER-TEAMS",
  "RUN-ANYWHERE-TERMUX",
  "RUN-ANYWHERE-V1-RELEASE-GATE",
  "PCLIP-MULTI-COMPANY",
  "PCLIP-MULTI-USER",
];

function planRank(item: RoadmapItem): number {
  const known = PLAN_ORDER.indexOf(item.id);
  if (known >= 0) return known;
  return item.status === "blocked" ? 100 : 200;
}

function fallbackActions(item: RoadmapItem): string[] {
  if (item.status === "blocked") {
    return [
      "Read the card notes and satisfy the named external proof before moving it back to building.",
      `Inspect: vanta roadmap unblock ${item.id}`,
    ];
  }
  return [
    "Make an explicit strategy decision before treating this horizon card as buildable.",
    `Inspect: vanta roadmap unblock ${item.id}`,
  ];
}

export function buildUnblockPlans(items: RoadmapItem[], ids: string[] = []): UnblockPlan[] {
  const wanted = new Set(ids);
  return items
    .filter((item) => item.status === "blocked" || item.status === "horizon")
    .filter((item) => wanted.size === 0 || wanted.has(item.id))
    .slice()
    .sort((a, b) => planRank(a) - planRank(b) || a.id.localeCompare(b.id))
    .map((item) => ({
      id: item.id,
      title: item.title,
      status: item.status,
      actions: KNOWN_ACTIONS[item.id] ?? fallbackActions(item),
    }));
}

export function formatUnblockPlans(plans: UnblockPlan[]): string {
  if (plans.length === 0) return "No blocked or decision-only roadmap cards matched.";
  return plans
    .map((plan) => [
      `${plan.id} (${plan.status}) - ${plan.title}`,
      ...plan.actions.map((action, index) => `  ${index + 1}. ${action}`),
    ].join("\n"))
    .join("\n\n");
}
