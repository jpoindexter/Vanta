import type { PermissionRequest } from "./request.js";
import type { InboundMessage } from "../gateway/platforms/base.js";

// CHANNEL-PERMISSIONS — relay a permission prompt to a messaging channel and
// race a channel reply ("yes/no <request_id>") against the local approver.
// First resolver wins; only allowlisted chats can approve; an unparseable or
// mismatched reply is ignored (default-deny on ambiguity — never auto-approves).
//
// Everything here is pure/injectable: the outbound `send`, the inbound reply
// source, the local resolver, and the clock are all passed in, so the relay is
// fully unit-testable with no real channel or network.

export type ApprovalVerdict = "allow" | "deny";
export type RelaySource = "channel" | "local";
export type RelayOutcome = { verdict: ApprovalVerdict; via: RelaySource };

/** An inbound channel reply, narrowed to what the relay needs to judge it. */
export type ApprovalReply = Pick<InboundMessage, "chatId" | "text">;

/** A reply source the race subscribes to: yields replies until aborted. */
export type ReplyStream = (signal: AbortSignal) => AsyncIterable<ApprovalReply>;

const ALLOW_WORDS = ["yes", "y", "approve", "allow", "ok"];
const DENY_WORDS = ["no", "n", "deny", "reject", "block"];

/**
 * The channel message text for a pending approval. Embeds `requestId` so the
 * human's reply can reference exactly this request, and surfaces only the
 * risk-relevant subject + reason (never tool internals or secrets the request
 * model already excludes).
 */
export function formatApprovalPrompt(request: PermissionRequest, requestId: string): string {
  const lines = [
    `Vanta needs approval [${requestId}]`,
    request.title,
    `• ${request.subject}`,
    `Why: ${request.reason}`,
    `Reply "yes ${requestId}" to allow or "no ${requestId}" to deny.`,
  ];
  return lines.join("\n");
}

/**
 * Parse a channel reply into an allow/deny verdict, or null when it does not
 * decisively answer THIS request. A verdict requires both a yes/no word AND the
 * matching `requestId` token — a wrong id, a missing id, or no decision word
 * all return null (default-deny: an ambiguous reply never approves).
 */
export function parseApprovalReply(text: string, requestId: string): ApprovalVerdict | null {
  const tokens = text.toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.includes(requestId.toLowerCase())) return null;
  const hasAllow = tokens.some((t) => ALLOW_WORDS.includes(t));
  const hasDeny = tokens.some((t) => DENY_WORDS.includes(t));
  if (hasAllow === hasDeny) return null; // none, or contradictory → ambiguous
  return hasAllow ? "allow" : "deny";
}

export type RelayApprovalArgs = {
  request: PermissionRequest;
  requestId: string;
  /** Outbound: deliver the prompt text to the channel (e.g. send_chat). */
  send: (text: string) => Promise<void>;
  /** Inbound: a stream of channel replies; cancelled via the AbortSignal when the race ends. */
  replies: ReplyStream;
  /** The local UI approver — the same `requestApproval` the loop already uses. */
  localResolve: (signal: AbortSignal) => Promise<boolean>;
  /** Chat ids permitted to approve; a reply from any other chat is ignored. */
  allowlist: readonly string[];
};

/**
 * Relay the approval to the channel and race the channel reply against the
 * local resolver — FIRST resolver wins. The loser is aborted via the shared
 * AbortController. Returns the winning verdict and which side won. A failed
 * outbound send does not block the local path; if the local resolver itself
 * throws, the relay denies (errors-as-values, never throws across the boundary).
 */
export async function relayApproval(args: RelayApprovalArgs): Promise<RelayOutcome> {
  const controller = new AbortController();
  await args.send(formatApprovalPrompt(args.request, args.requestId)).catch(() => {});

  const channel = channelRace(args, controller.signal);
  const local = localRace(args.localResolve, controller.signal);

  try {
    return await Promise.race([channel, local]);
  } finally {
    controller.abort();
  }
}

/** Resolve from the first allowlisted, decisive channel reply for this request. */
async function channelRace(args: RelayApprovalArgs, signal: AbortSignal): Promise<RelayOutcome> {
  const allowed = new Set(args.allowlist);
  for await (const reply of args.replies(signal)) {
    if (signal.aborted) break;
    if (!allowed.has(reply.chatId)) continue; // allowlist: a stranger's reply never counts
    const verdict = parseApprovalReply(reply.text ?? "", args.requestId);
    if (verdict) return { verdict, via: "channel" };
    // a malformed/wrong-id reply is ignored, not fatal — keep listening
  }
  return blockForever(signal);
}

/** Resolve from the local UI approver; deny on a thrown approver (fail closed). */
async function localRace(
  localResolve: (signal: AbortSignal) => Promise<boolean>,
  signal: AbortSignal,
): Promise<RelayOutcome> {
  try {
    const approved = await localResolve(signal);
    return { verdict: approved ? "allow" : "deny", via: "local" };
  } catch {
    return { verdict: "deny", via: "local" };
  }
}

/** A promise that resolves only when the race is aborted — lets the other side win cleanly. */
function blockForever(signal: AbortSignal): Promise<RelayOutcome> {
  return new Promise<RelayOutcome>(() => {
    // Intentionally never resolves; the shared AbortController ends the race.
    // The abort listener keeps the await from leaking once the winner returns.
    signal.addEventListener("abort", () => {}, { once: true });
  });
}
