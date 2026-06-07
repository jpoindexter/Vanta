// MODE-DETECT — pick the conversational STANCE from the request itself, so a
// "just do it" gets a silent executor and a "what do you think" gets a
// collaborator, without the user naming a mode. Distinct from MODES-v2 (modes
// the user sets) — this is Vanta reading the room. A short hint is prepended to
// the turn; the default "assistant" stance injects nothing (no noise).

export type Mode = "silent-executor" | "collaborator" | "critic" | "researcher" | "debugger" | "assistant";

// Order matters: more specific stances win over the generic executor.
const RULES: ReadonlyArray<readonly [Mode, RegExp]> = [
  ["debugger", /\b(bug|broken|broke|crash(ed|ing)?|error|errors|failing|fails|failed|doesn'?t work|not working|stack ?trace|regression|why is|diagnose)\b/i],
  ["critic", /\b(review|critique|criticize|roast|is this (good|right|ok)|what'?s wrong|problems? with|feedback on|poke holes|red ?team)\b/i],
  ["researcher", /\b(research|investigate|look into|find out|what'?s the latest|compare|survey|sources?|deep ?dive|explore the)\b/i],
  ["collaborator", /\b(what do you think|thoughts\??|should (i|we)|help me decide|brainstorm|let'?s think|opinion|which (one|approach)|how should)\b/i],
  ["silent-executor", /\b(just do it|go ahead|do it|make it so|fix it|implement|build it|ship it|run it|apply|execute|proceed|no (chat|talk))\b/i],
];

/** Classify the request into a stance. Defaults to "assistant" (balanced). Pure. */
export function detectMode(text: string): Mode {
  for (const [mode, re] of RULES) if (re.test(text)) return mode;
  return "assistant";
}

const DIRECTIVES: Record<Mode, string> = {
  "silent-executor": "[stance: silent executor — minimal talk, just do the work and report the verified result]",
  collaborator: "[stance: collaborator — surface options + tradeoffs and think it through with me before acting]",
  critic: "[stance: critic — find the real problems and weak points, be specific, don't soften]",
  researcher: "[stance: researcher — investigate, compare sources, cite evidence, flag uncertainty]",
  debugger: "[stance: debugger — systematic root-cause first; reproduce, isolate, then fix]",
  assistant: "",
};

/** The one-line stance hint to prepend, or null for the neutral default. Pure. */
export function buildModeHint(text: string): string | null {
  const mode = detectMode(text);
  return DIRECTIVES[mode] || null;
}
