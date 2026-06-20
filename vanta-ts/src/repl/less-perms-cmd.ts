import type { Message } from "../types.js";
import type { PermRule } from "../permissions/rules.js";
import { DEFAULT_AUTO_MODE_CONFIG } from "../permissions/auto-mode.js";
import type { ReplCtx, SlashResult, SlashHandler } from "./types.js";

/** Default minimum number of approvals before a tool is worth proposing an allow rule for. */
export const DEFAULT_PROPOSE_THRESHOLD = 2;

/** A single tool call observed in the session — only the name is load-bearing here. */
export type SessionToolCall = { name: string };

/** Options for {@link proposeReadOnlyRules}. */
export type ProposeOpts = {
  /** Minimum repeat count (inclusive) before a tool is proposed. Defaults to {@link DEFAULT_PROPOSE_THRESHOLD}. */
  threshold?: number;
};

/**
 * The read-only / safe tool allowlist, derived from the auto-mode classifier so
 * there is ONE source of truth. We only ever propose allow rules for tools the
 * auto-mode config already classifies as `allow` (read-only inspection/search).
 * A mutating tool (write_file, shell_cmd, …) is never on this set, so it can
 * never be proposed even if it was approved on every turn.
 */
export const READ_ONLY_SAFE_TOOLS: ReadonlySet<string> = new Set(
  DEFAULT_AUTO_MODE_CONFIG.rules
    .filter((rule) => rule.action === "allow" && typeof rule.tool === "string")
    .map((rule) => rule.tool as string),
);

/** True when a tool is on the read-only/safe allowlist (the only proposable set). */
export function isReadOnlySafeTool(name: string): boolean {
  return READ_ONLY_SAFE_TOOLS.has(name);
}

/** Count how many times each read-only/safe tool was called. Pure. */
function countSafeCalls(toolCalls: ReadonlyArray<SessionToolCall>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const call of toolCalls) {
    if (!isReadOnlySafeTool(call.name)) continue;
    counts.set(call.name, (counts.get(call.name) ?? 0) + 1);
  }
  return counts;
}

/**
 * Propose allow rules for repeatedly-used READ-ONLY/safe tools. Pure.
 *
 * Only tools on {@link READ_ONLY_SAFE_TOOLS} used at least `threshold` times are
 * proposed; each is proposed once (deduped). Returns `allow` {@link PermRule}s —
 * the exact shape the existing permission-rule mechanism accepts — sorted by
 * descending use count (most-prompted first), name as a stable tiebreaker. Never
 * grants anything; the caller surfaces these for the operator to accept.
 */
export function proposeReadOnlyRules(
  toolCalls: ReadonlyArray<SessionToolCall>,
  opts: ProposeOpts = {},
): PermRule[] {
  const threshold = opts.threshold ?? DEFAULT_PROPOSE_THRESHOLD;
  const counts = countSafeCalls(toolCalls);
  const qualifying = [...counts.entries()].filter(([, count]) => count >= threshold);
  qualifying.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return qualifying.map(([tool]) => ({ action: "allow", tool }));
}

/**
 * Render the proposed rules as numbered, human-facing proposal text. Pure.
 * Empty input → a clean "nothing to propose" message. Never auto-grants; the
 * trailing line tells the operator how to accept a rule themselves.
 */
export function formatRulesProposal(rules: ReadonlyArray<PermRule>): string {
  if (!rules.length) {
    return "  No repeatedly-approved read-only tools to propose — nothing to allow yet.";
  }
  const lines = rules.map(
    (rule, i) => `  ${i + 1}. allow ${rule.tool ?? "*"}  (read-only — repeatedly approved this session)`,
  );
  return [
    "  Proposed read-only allow rules (cut future permission prompts):",
    ...lines,
    "",
    "  These only PROPOSE — nothing was granted. To accept one, run:",
    "    /permissions allow <tool>",
  ].join("\n");
}

/** Pull observed tool-call names off the live conversation. */
function sessionToolCalls(messages: ReadonlyArray<Message>): SessionToolCall[] {
  const calls: SessionToolCall[] = [];
  for (const m of messages) {
    if (m.role === "assistant" && m.toolCalls?.length) {
      for (const tc of m.toolCalls) calls.push({ name: tc.name });
    }
  }
  return calls;
}

/**
 * /less-permission-prompts — scan this session's tool usage for repeatedly-used
 * read-only tools and PROPOSE allow rules the operator can accept. Read-only
 * only, propose-only: it never grants and never proposes a mutating tool.
 */
export const lessPerms: SlashHandler = (_arg, ctx: ReplCtx): SlashResult => {
  const rules = proposeReadOnlyRules(sessionToolCalls(ctx.convo.messages));
  return { output: formatRulesProposal(rules) };
};
