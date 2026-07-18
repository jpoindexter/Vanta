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
    "Run `vanta backend gateway status --json` and follow its exact `next` lines first.",
    "Deploy if needed with `vanta backend gateway deploy`; Vanta will not copy local keys into Modal secrets.",
    "If status reports a missing or invalid Telegram token, replace `VANTA_TELEGRAM_TOKEN` with a valid BotFather token and set `VANTA_TELEGRAM_WEBHOOK_SECRET`.",
    "Register the deployed HTTPS endpoint with `vanta backend gateway register-telegram <https-endpoint>`.",
    "Only when status stops reporting setup errors, arm and prove the live wake path: `vanta backend gateway arm`, send the bot a message, then `vanta backend gateway prove`.",
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
    "Use the Excel host adapter in `examples/spreadsheet-sidecar/excel-custom-functions.ts`, or follow the Google Sheets host path below.",
    "Open a private Google Sheet and load `examples/spreadsheet-sidecar/google-sheets/Code.gs` through Extensions > Apps Script.",
    "Create a revocable API token, expose Vanta through HTTPS, and store only the URL/token in Apps Script Properties.",
    "Invoke VANTA_ASK with bounded workbook context, then approve one exact pending workbook action from the Vanta menu.",
    "Run `vanta spreadsheet host-proof --host google_sheets --receipt <receipt> --session <id> --evidence <host-file> --yes`, then revoke the token.",
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
    "Bind the redacted provider evidence with `vanta roadmap proof-record HERMES-PAYMENT-SKILL-PACK <link-event-id> <mpp-event-id> --evidence <file> --yes`.",
    "Keep real-money mode disabled; sandbox Link and MPP receipts are the release proof.",
  ],
  "HERMES-SHOPIFY-OPERATIONS": [
    "Create a Shopify development store and register `SHOPIFY_DEV_TOKEN` as a scoped Vanta vault alias for that exact store.",
    "Run `vanta shopify read <profile> products`, then preview and apply one typed development-store mutation with its exact approval id.",
    "Require the mutation receipt and separate readback verification before moving the card out of parked.",
    "Bind the redacted readback evidence with `vanta roadmap proof-record HERMES-SHOPIFY-OPERATIONS <event-id> --evidence <file> --yes`.",
  ],
  "HERMES-TELEPHONY-CONSENT-LIFECYCLE": [
    "Configure a Twilio test account, scoped `TWILIO_TEST_TOKEN` vault alias, and explicit `VANTA_TELEPHONY_TEST_API_BASE`.",
    "Expose `vanta telephony ingress <profile> --public-url https://<host>/twilio` through HTTPS and verify signed callbacks.",
    "Execute consented test SMS and call contracts with exact approval ids, then prove callback correlation and recording-retention deletion receipts.",
    "Bind the redacted lifecycle evidence with `vanta roadmap proof-record HERMES-TELEPHONY-CONSENT-LIFECYCLE <event-id...> --evidence <file> --yes`.",
  ],
  "HERMES-COMMERCE-TELEPHONY-SKILL-PACK": [
    "Ship HERMES-PAYMENT-SKILL-PACK with live sandbox Link and MPP receipts.",
    "Ship HERMES-SHOPIFY-OPERATIONS with a verified development-store mutation receipt.",
    "Ship HERMES-TELEPHONY-CONSENT-LIFECYCLE with live Twilio callback and retention receipts.",
    "Only then execute and ship this aggregate release gate.",
  ],
};

export function knownUnblockActions(id: string): string[] {
  return [...(KNOWN_ACTIONS[id] ?? [])];
}

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
