import { createHash, randomUUID } from "node:crypto";
import {
  addComment,
  createTicket,
  listTickets,
  setInbox,
  type Ticket,
  type TicketDeps,
} from "../tickets/store.js";

export type NeedsHumanKind = "missing_tool" | "repeated_failure" | "decision" | "permission" | "maintenance_budget";
export type NeedsHumanInput = {
  kind: NeedsHumanKind;
  title: string;
  reason: string;
  nextAction: string;
  source?: string;
};
export type NeedsHumanDeps = TicketDeps;

const BASE_LABEL = "needs-human";
const BLOCKER_RE = /\b(?:not configured|unavailable|missing (?:tool|adapter|credential|permission)|no (?:configured|available) (?:tool|adapter)|needs? human|human (?:input|setup|approval) (?:is )?required|approval required|blocked|denied)\b/i;

function defaultDeps(): NeedsHumanDeps {
  return { now: () => new Date(), id: () => `tkt-${randomUUID().slice(0, 8)}` };
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 180);
}

function blockerLabel(input: Pick<NeedsHumanInput, "kind" | "title">): string {
  const hash = createHash("sha256").update(`${input.kind}:${normalize(input.title)}`).digest("hex").slice(0, 12);
  return `needs-human:${hash}`;
}

function commentText(input: NeedsHumanInput): string {
  return [
    `Reason: ${input.reason.trim()}`,
    `Next action: ${input.nextAction.trim()}`,
    input.source ? `Source: ${input.source}` : "",
  ].filter(Boolean).join("\n");
}

export async function upsertNeedsHumanTicket(
  dataDir: string,
  input: NeedsHumanInput,
  deps: NeedsHumanDeps = defaultDeps(),
): Promise<{ ticket: Ticket; created: boolean }> {
  const key = blockerLabel(input);
  const existing = (await listTickets(dataDir)).find((ticket) =>
    (ticket.status === "open" || ticket.status === "in_progress") && ticket.labels.includes(key));
  if (existing) {
    await setInbox(dataDir, existing.id, "unread", deps);
    const updated = await addComment(dataDir, existing.id, commentText(input), deps);
    return { ticket: updated ?? existing, created: false };
  }
  const created = await createTicket(dataDir, {
    title: input.title.trim().slice(0, 160),
    labels: [BASE_LABEL, `needs-human:${input.kind}`, key],
  }, deps);
  const withComment = await addComment(dataDir, created.id, commentText(input), deps);
  return { ticket: withComment ?? created, created: true };
}

export function classifyNeedsHuman(
  instruction: string,
  outcome: { finalText: string; stoppedReason: string },
): NeedsHumanInput | null {
  const title = `Needs human: ${instruction.trim().replace(/\s+/g, " ").slice(0, 120) || "unresolved run"}`;
  if (outcome.stoppedReason === "repeated_failure" || outcome.stoppedReason === "max_iterations") {
    return {
      kind: "repeated_failure",
      title,
      reason: outcome.finalText,
      nextAction: "Review the failed path, supply the missing capability or decision, then resume the task.",
    };
  }
  if (!BLOCKER_RE.test(outcome.finalText)) return null;
  const kind: NeedsHumanKind = /permission|approval|blocked|denied/i.test(outcome.finalText) ? "permission" : "missing_tool";
  return {
    kind,
    title,
    reason: outcome.finalText,
    nextAction: kind === "permission"
      ? "Review the blocked action and approve, narrow, or reject it."
      : "Configure or build the missing capability, then resume the task.",
  };
}

export async function recordNeedsHumanOutcome(
  dataDir: string,
  input: {
    instruction: string;
    outcome: { finalText: string; stoppedReason: string };
    source?: string;
    deps?: NeedsHumanDeps;
  },
): Promise<{ ticket: Ticket; created: boolean } | null> {
  const classified = classifyNeedsHuman(input.instruction, input.outcome);
  if (!classified) return null;
  return upsertNeedsHumanTicket(dataDir, { ...classified, source: input.source }, input.deps ?? defaultDeps());
}
