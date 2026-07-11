import type { RoadmapItem } from "./schema.js";

export type UnblockPlan = {
  id: string;
  title: string;
  status: RoadmapItem["status"];
  parkedReason?: RoadmapItem["parkedReason"];
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
    "Use release v0.9.0 or newer, which includes `vanta-kernel-aarch64-linux-android` plus its `.sha256`.",
    "On a physical ARM64 Android/Termux device, run `scripts/termux-arm64-device-proof.sh --require-release-kernel`.",
    "Keep parked until the real device proof reaches TERMUX_ARM64_E2E_OK with `release_kernel=1`.",
  ],
  "RUN-ANYWHERE-V1-RELEASE-GATE": [
    "Ship BACKEND-SERVERLESS-LIVE with a real remote wake/reply/scaledown proof.",
    "Ship MSG-ADAPTER-TEAMS with a real Azure/Teams round trip.",
    "Ship RUN-ANYWHERE-TERMUX with a physical ARM64 release-kernel proof.",
  ],
  "HERMES-SPREADSHEET-COPILOT": [
    "Install a real Excel host (or choose a Google Sheets host) and load `examples/spreadsheet-sidecar/excel-custom-functions.ts`.",
    "Create a revocable API token, expose Vanta through HTTPS, and set `VANTA_PUBLIC_API_ALLOWED_ORIGINS` to the exact add-in origin.",
    "Invoke the custom function with bounded workbook context, then execute one approval-gated workbook action through the same kernel session.",
    "Keep parked until the host round trip and workbook receipt both exist; local XLSX/LibreOffice output is not host proof.",
  ],
  "MERCURY-CROSS-PLATFORM-SERVICE": [
    "Use a real logged-in Windows desktop session; GitHub-hosted runners do not provide the required InteractiveToken session.",
    "From `vanta-ts` in PowerShell, run `npm ci` and `node --import tsx scripts/service-native-proof.ts`.",
    "Require `.artifacts/service-proof-win32.json` with `ok: true` before shipping the cross-platform service card.",
  ],
  "HERMES-PAYMENT-SKILL-PACK": [
    "Configure a real Stripe Link sandbox/test account behind the isolated `VANTA_PAYMENT_TEST_LINK_CLI` adapter.",
    "Execute `vanta payments preview` and `vanta payments execute ... --approve <exact-id>`, then require an authorized redacted receipt.",
    "Run a bounded live MPP HTTP 402 test contract and require the paid-retry receipt with the exact amount, currency, merchant, item, and resource.",
    "Keep real-money mode disabled; sandbox Link and MPP receipts are the release proof.",
  ],
  "HERMES-SHOPIFY-OPERATIONS": [
    "Create a Shopify development store and register `SHOPIFY_DEV_TOKEN` as a scoped Vanta vault alias for that exact store.",
    "Run `vanta shopify read <profile> products`, then preview and apply one typed development-store mutation with its exact approval id.",
    "Require the mutation receipt and separate readback verification before moving the card out of parked.",
  ],
  "HERMES-TELEPHONY-CONSENT-LIFECYCLE": [
    "Configure a Twilio test account, scoped `TWILIO_TEST_TOKEN` vault alias, and explicit `VANTA_TELEPHONY_TEST_API_BASE`.",
    "Expose `vanta telephony ingress <profile> --public-url https://<host>/twilio` through HTTPS and verify signed callbacks.",
    "Execute consented test SMS and call contracts with exact approval ids, then prove callback correlation and recording-retention deletion receipts.",
  ],
  "HERMES-COMMERCE-TELEPHONY-SKILL-PACK": [
    "Ship HERMES-PAYMENT-SKILL-PACK with live sandbox Link and MPP receipts.",
    "Ship HERMES-SHOPIFY-OPERATIONS with a verified development-store mutation receipt.",
    "Ship HERMES-TELEPHONY-CONSENT-LIFECYCLE with live Twilio callback and retention receipts.",
    "Only then execute and ship this aggregate release gate.",
  ],
  "PCLIP-MULTI-COMPANY": [
    "Ratify a strategy change away from the current single-operator/local-first direction.",
    "Only then move the card out of horizon and decompose isolation, audit, and data-boundary work.",
  ],
  "PCLIP-MULTI-USER": [
    "Ratify multiple human supervisors as an intentional product direction.",
    "Only then move the card out of horizon and decompose roles, invites, board access, and run credentials.",
  ],
  "GHOST-OS-MCP": [
    "Install Ghost OS in a scratch Vanta config; do not re-add code from static inspection alone.",
    "Run `ghost doctor` and verify the real MCP server exposes harmless read/list tools.",
    "Prove one harmless recipe end-to-end under kernel approval before moving this card back to building.",
  ],
  "VANTA-H-GITHUB": [
    "Do not build the hosted GitHub App path unless Vanta intentionally grows a hosted-app surface.",
    "If that strategy changes, first prove local git/gh tools are insufficient for the user workflow.",
    "Then decompose app install, webhook auth, PR status, and `--from-pr` as separate cards.",
  ],
  "VANTA-H-SLACK": [
    "Do not build the hosted Slack app path unless Vanta intentionally grows a hosted-app surface.",
    "If that strategy changes, first prove existing messaging adapters are insufficient.",
    "Then decompose Slack app install, event auth, allowlist, and gateway reply proof as separate cards.",
  ],
  "PLATFORM-MOBILE-TERMUX": [
    "Do not build independently; RUN-ANYWHERE-TERMUX owns this work.",
    "Keep this parked duplicate until RUN-ANYWHERE-TERMUX ships or is deliberately split again.",
  ],
  "VANTA-A2A-AUTONOMOUS-SANDBOX": [
    "Reproduce whether Claude can run inside the OS sandbox with the current CLI before changing Vanta code.",
    "If still blocked, choose a different containment backend instead of tuning macOS seatbelt blind.",
    "Only ship after a real npm-driven autonomous build completes inside the chosen sandbox.",
  ],
};

const PLAN_ORDER = [
  "BACKEND-SERVERLESS-LIVE",
  "MSG-ADAPTER-TEAMS",
  "RUN-ANYWHERE-TERMUX",
  "RUN-ANYWHERE-V1-RELEASE-GATE",
  "HERMES-SPREADSHEET-COPILOT",
  "MERCURY-CROSS-PLATFORM-SERVICE",
  "HERMES-PAYMENT-SKILL-PACK",
  "HERMES-SHOPIFY-OPERATIONS",
  "HERMES-TELEPHONY-CONSENT-LIFECYCLE",
  "HERMES-COMMERCE-TELEPHONY-SKILL-PACK",
  "PCLIP-MULTI-COMPANY",
  "PCLIP-MULTI-USER",
];

function planRank(item: RoadmapItem): number {
  const known = PLAN_ORDER.indexOf(item.id);
  if (known >= 0) return known;
  if (item.status === "blocked") return 100;
  if (item.status === "parked") return 150;
  return 200;
}

function fallbackActions(item: RoadmapItem): string[] {
  if (item.status === "blocked") {
    return [
      "Read the card notes and satisfy the named external proof before moving it back to building.",
      `Inspect: vanta roadmap unblock ${item.id}`,
    ];
  }
  if (item.status === "parked") {
    if (item.parkedReason === "declined/n-a") {
      return [
        "Leave parked unless the architecture or product direction changes enough to make this applicable.",
        "If revived, rewrite the done criteria first so it describes a Vanta-native outcome.",
        `Inspect: vanta roadmap unblock ${item.id}`,
      ];
    }
    if (item.parkedReason === "duplicate") {
      return [
        "Do not build independently; keep the owning card as the source of truth.",
        "Split this card only if the owning card no longer covers the work.",
        `Inspect: vanta roadmap unblock ${item.id}`,
      ];
    }
    if (item.parkedReason === "strategy decision") {
      return [
        "Make the strategy decision explicit before treating this as buildable.",
        "If accepted, decompose it into smaller next/building cards with concrete proof gates.",
        `Inspect: vanta roadmap unblock ${item.id}`,
      ];
    }
    if (item.parkedReason === "external proof" || item.parkedReason === "optional proof") {
      return [
        "Read the card notes and run the named real-world proof before moving it back to building.",
        "Do not substitute mocks, static inspection, or adjacent tests for the proof.",
        `Inspect: vanta roadmap unblock ${item.id}`,
      ];
    }
    return [
      "This card is deliberately parked outside the build sequence; read its notes before reviving it.",
      "Move it back to `next` or `building` only after the parked reason is no longer true.",
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
    .filter((item) => item.status === "blocked" || item.status === "horizon" || item.status === "parked")
    .filter((item) => wanted.size === 0 || wanted.has(item.id))
    .slice()
    .sort((a, b) => planRank(a) - planRank(b) || a.id.localeCompare(b.id))
    .map((item) => ({
      id: item.id,
      title: item.title,
      status: item.status,
      parkedReason: item.parkedReason,
      actions: KNOWN_ACTIONS[item.id] ?? fallbackActions(item),
    }));
}

export function formatUnblockPlans(plans: UnblockPlan[]): string {
  if (plans.length === 0) return "No blocked, parked, or decision-only roadmap cards matched.";
  return plans
    .map((plan) => [
      `${plan.id} (${[plan.status, plan.parkedReason].filter(Boolean).join(" · ")}) - ${plan.title}`,
      ...plan.actions.map((action, index) => `  ${index + 1}. ${action}`),
    ].join("\n"))
    .join("\n\n");
}
