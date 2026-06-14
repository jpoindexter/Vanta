import { z } from "zod";

/**
 * The browser "body" action schema — the click/type/press primitives that let
 * the agent DRIVE a page, not just read it. Kept as a discriminated union so the
 * model can only emit a well-formed action, and so risk classification (below)
 * can switch exhaustively on `type`.
 */
export const BrowserActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("navigate"), url: z.string().url() }),
  z.object({
    type: z.literal("click"),
    selector: z.string().min(1).optional(),
    text: z.string().min(1).optional(),
  }),
  z.object({
    type: z.literal("type"),
    selector: z.string().min(1),
    value: z.string(),
    secret: z.boolean().optional(),
  }),
  z.object({ type: z.literal("press"), key: z.string().min(1) }),
  z.object({ type: z.literal("scroll") }),
  z.object({ type: z.literal("wait"), ms: z.number().int().positive().max(30_000) }),
]);

export type BrowserAction = z.infer<typeof BrowserActionSchema>;

export type ActionRisk = { risk: "safe" | "risky"; reason?: string };

// A click/press whose target commits something the user can't easily undo:
// purchases, submissions, deletions, sends, auth. Matched against the click
// selector/text or an Enter keypress (which submits most forms).
const IRREVERSIBLE =
  /\b(submit|buy|purchase|pay|payment|checkout|place\s?order|order|confirm|delete|remove|send|transfer|withdraw|sign\s?in|log\s?in|login|register|subscribe|unsubscribe|accept)\b/i;

/**
 * Classify one action as `safe` (reads, navigation, scrolling) or `risky` (an
 * irreversible UI commit or credential entry). The agent's body must STOP and
 * ask before a risky action — never improvise a purchase, login, or submit.
 */
export function classifyAction(action: BrowserAction): ActionRisk {
  if (action.type === "type") {
    return action.secret
      ? { risk: "risky", reason: "enters a credential/secret value" }
      : { risk: "safe" };
  }
  if (action.type === "press") {
    return /^enter$/i.test(action.key)
      ? { risk: "risky", reason: "Enter submits the focused form" }
      : { risk: "safe" };
  }
  if (action.type === "click") {
    const target = action.selector ?? action.text ?? "";
    const hit = IRREVERSIBLE.exec(target);
    return hit
      ? { risk: "risky", reason: `clicks an irreversible control ("${hit[1]}")` }
      : { risk: "safe" };
  }
  return { risk: "safe" };
}

/** One-line human description of an action. Secret values are masked. */
export function describeAction(action: BrowserAction): string {
  switch (action.type) {
    case "navigate":
      return `navigate → ${action.url}`;
    case "click":
      return `click → ${action.selector ?? `text=${action.text ?? ""}`}`;
    case "type":
      return `type → ${action.selector} = ${
        action.secret ? "••••••" : JSON.stringify(action.value)
      }`;
    case "press":
      return `press → ${action.key}`;
    case "scroll":
      return "scroll ↓";
    case "wait":
      return `wait → ${action.ms}ms`;
  }
}

/** The risky actions in a sequence, with their 1-based position and reason. */
export function riskyActions(
  actions: BrowserAction[],
): Array<{ index: number; action: BrowserAction; reason: string }> {
  const out: Array<{ index: number; action: BrowserAction; reason: string }> = [];
  actions.forEach((action, i) => {
    const { risk, reason } = classifyAction(action);
    if (risk === "risky") out.push({ index: i + 1, action, reason: reason ?? "irreversible" });
  });
  return out;
}

/**
 * A numbered dry-run preview of the whole sequence — what the body WILL do,
 * with a ⚠ flag and reason on each risky step. Shown to the human before any
 * irreversible action runs.
 */
export function previewActions(actions: BrowserAction[]): string {
  return actions
    .map((action, i) => {
      const { risk, reason } = classifyAction(action);
      const mark = risk === "risky" ? " ⚠" : "";
      const why = risk === "risky" && reason ? `  (${reason})` : "";
      return `  ${i + 1}.${mark} ${describeAction(action)}${why}`;
    })
    .join("\n");
}
