// BUILTIN-AGENTS — a registry of built-in subagent TYPES. Each type is a name +
// a one-line description + a tool-scope policy (allow/deny against the present
// tool names) + a short persona addon (its disposition). `delegate`/spawn can
// resolve a named type so a worker is born with the right capabilities and
// stance: "explore" reads only, "plan" reads + reasons without mutating,
// "verification" reads + runs/checks, "general-purpose" gets everything.
//
// PURE: a frozen registry + a resolver + a filter. No I/O, no LLM. Mirrors the
// denylist style of `agent/coordinator-mode.ts` for the restricted types.
//
// Not wired into the live spawn/registry this round (delivered as the pure layer
// + tests). NAMED wire-up point (mirrors how coordinator-mode names its two
// consumers): in `tools/delegate.ts` `runDelegate` — where the child registry is
// built as `buildRegistry({ exclude: ["delegate"] })` — resolve the requested
// type with `resolveBuiltinAgent(args.agent_type)`, compute the allowed names via
// `agentToolFilter(type, registry.list().map((t) => t.name))`, and pass the
// complement as `exclude` (plus the type's `persona` injected into the worker's
// system prompt in `subagent/spawn.ts`). The kernel still gates every call; this
// only narrows which tools the worker is offered.

/** Read-only inspection tools — the floor every restricted type may use. */
const READ_ONLY_TOOLS: readonly string[] = [
  "read_file",
  "grep_files",
  "glob_files",
  "code_search",
  "inspect_state",
] as const;

/** Reasoning/coordination tools a planner may use without mutating the world. */
const PLAN_TOOLS: readonly string[] = ["todo", "clarify"] as const;

/** Run/check tools a verifier may use on top of the read-only floor. */
const VERIFICATION_TOOLS: readonly string[] = ["shell_cmd", "regression_lock"] as const;

/** The fallback type name used when a requested type is unknown or omitted. */
export const DEFAULT_AGENT_TYPE = "general-purpose" as const;

/**
 * A built-in subagent type: a named capability + disposition profile.
 *
 * Tool scope is `allowTools` ("all" = the full present set, or an allowlist of
 * names) optionally narrowed by `denyTools`. Filtering keeps only names that
 * actually exist in the child registry, so an allowlisted-but-absent tool is a
 * no-op and an unknown tool is never silently granted.
 */
export type BuiltinAgentType = {
  /** Stable type name resolvers/spawn match on (e.g. "explore"). */
  readonly name: string;
  /** One-line description of what this type is for. */
  readonly description: string;
  /** "all" = every present tool; an array = an explicit allowlist. */
  readonly allowTools?: "all" | readonly string[];
  /** Names removed even if allowed — applied after the allowlist. */
  readonly denyTools?: readonly string[];
  /** Short system-prompt addon describing the type's stance. */
  readonly persona: string;
};

/**
 * The built-in subagent types, keyed by name. Frozen so the registry is a
 * read-only source of truth. Restricted types use explicit allowlists; the
 * general-purpose default uses "all" (current behavior — full tool set).
 */
export const BUILTIN_AGENTS: Readonly<Record<string, BuiltinAgentType>> = Object.freeze({
  explore: {
    name: "explore",
    description: "Read-only search: locate and read code/state, never mutate.",
    allowTools: READ_ONLY_TOOLS,
    persona: [
      "EXPLORE — you are a read-only search worker.",
      "Find and read the relevant code/state; report what exists and where.",
      "You have no mutation tools: do not attempt to write, run, or change anything.",
      "Return your findings as your final text — locations, excerpts, the answer.",
    ].join("\n"),
  },
  plan: {
    name: "plan",
    description: "Read + reason: design an approach without mutating or delegating.",
    allowTools: [...READ_ONLY_TOOLS, ...PLAN_TOOLS],
    // No-mutate by construction (allowlist is read+reason only); deny delegate so
    // a planner cannot recurse into more workers.
    denyTools: ["delegate"],
    persona: [
      "PLAN — you are a planning worker: read, reason, and produce a plan.",
      "Inspect the relevant code/state, then lay out an ordered, concrete approach.",
      "Do NOT mutate anything and do NOT spawn further workers — output the plan only.",
      "End with the plan as your final text: the steps, the files touched, the risks.",
    ].join("\n"),
  },
  verification: {
    name: "verification",
    description: "Read + run/check: execute tests/commands to verify, no broad writes.",
    // Read-only floor plus the run/check tools — no write_file/edit_file, so no
    // broad authoring; shell_cmd is allowed for running tests/commands.
    allowTools: [...READ_ONLY_TOOLS, ...VERIFICATION_TOOLS],
    persona: [
      "VERIFICATION — you are a verification worker: prove or disprove a claim.",
      "Read the relevant code/state and RUN the checks (tests, commands, locks).",
      "You cannot author broad changes; your job is to observe and report a verdict.",
      "End with a clear pass/fail verdict and the evidence (command, output) behind it.",
    ].join("\n"),
  },
  "general-purpose": {
    name: "general-purpose",
    description: "Full tool set — the default worker; can read, reason, run, and mutate.",
    allowTools: "all",
    persona: [
      "GENERAL-PURPOSE — you are a full-capability worker.",
      "Use the available tools to achieve your scoped goal end-to-end.",
      "Every action is still gated by the kernel; verify your result before reporting done.",
    ].join("\n"),
  },
});

/** The general-purpose fallback type — the resolver's default for unknown/empty. */
const GENERAL_PURPOSE = BUILTIN_AGENTS[DEFAULT_AGENT_TYPE] as BuiltinAgentType;

/**
 * Resolve a requested type name to its {@link BuiltinAgentType}. Trims + lowers
 * the name for a forgiving match. An unknown name, an empty string, `undefined`,
 * or `null` all fall back to the general-purpose default (current behavior =
 * full tool set), so a caller never gets nothing. Pure.
 */
export function resolveBuiltinAgent(name?: string | null): BuiltinAgentType {
  const key = (name ?? "").trim().toLowerCase();
  if (key.length === 0) return GENERAL_PURPOSE;
  return BUILTIN_AGENTS[key] ?? GENERAL_PURPOSE;
}

/**
 * Given a type and every tool name present in the child registry, return the
 * allowed names for that type — the allowlist (or "all") intersected with the
 * present names, then minus `denyTools`. Order-preserving (follows the present
 * names), deduped, and never includes an absent tool. Pure; feeds the
 * `exclude` computation at the named delegate/spawn wire-up point.
 */
export function agentToolFilter(
  type: Pick<BuiltinAgentType, "allowTools" | "denyTools">,
  allToolNames: readonly string[],
): string[] {
  const deny = new Set(type.denyTools ?? []);
  const allow = type.allowTools;
  const allowAll = allow === "all" || allow === undefined;
  const allowSet = allowAll ? null : new Set(allow);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of allToolNames) {
    if (deny.has(name) || seen.has(name)) continue;
    if (allowSet !== null && !allowSet.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}
