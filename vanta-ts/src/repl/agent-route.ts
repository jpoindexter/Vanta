// VANTA-AGENT-ROUTING-DISCOVERY — route "talk to / start / use another coding
// agent" intent to the `call_agent` tool. Root cause from the 2026-06-25 session:
// Vanta has call_agent (drives claude/codex/gemini/cursor-agent/opencode) but the
// model never reached for it — it shelled out (`claude -p`, `tmux`) and dead-ended
// on the auto-sandbox. Mirrors mode-detect.ts: a one-line hint prepended to the
// turn so the model picks the purpose-built tool instead of raw shell.

// A use/talk verb sitting near a known-agent name → intent to DRIVE that agent.
const VERB_NEAR_AGENT =
  /\b(talk to|speak to|ask|start(?:\s+up)?|spin up|launch|use|run|call|open|fire up|delegate to|hand (?:off|it) to)\b[\s\S]{0,30}\b(claude|codex|gemini|cursor|opencode)\b/i;
// An explicit external-agent reference — strong enough to route with no verb.
const STRONG =
  /\b(claude code|cursor[- ]agent|opencode|another (?:ai )?agent|other agent|second agent|a (?:different|separate) agent|sub-?agents?)\b/i;
// A known-agent name qualified as a CLI/agent/session → an external agent, not a model id.
const AGENT_AS_CLI =
  /\b(claude|codex|gemini|cursor|opencode)\b[\s\S]{0,20}\b(cli|agent|terminal|session|harness)\b/i;

/** True when the message expresses intent to use another coding agent. Pure. */
export function hasAgentIntent(text: string): boolean {
  return STRONG.test(text) || VERB_NEAR_AGENT.test(text) || AGENT_AS_CLI.test(text);
}

/** The specific known agent named in the text, or null (cursor → cursor-agent). Pure. */
export function detectAgentName(text: string): string | null {
  const m = /\b(claude|codex|gemini|cursor[- ]agent|cursor|opencode)\b/i.exec(text);
  if (!m) return null;
  const raw = m[1]!.toLowerCase().replace(/\s+/g, "-");
  return raw === "cursor" ? "cursor-agent" : raw;
}

/**
 * The one-line route hint to prepend to the turn, or null when there's no
 * cross-agent intent. Pure — the host gates on `VANTA_AGENT_ROUTE`.
 */
export function buildAgentRouteHint(text: string): string | null {
  if (!hasAgentIntent(text)) return null;
  const agent = detectAgentName(text);
  const named = agent ? `:"${agent}"` : "";
  const label = agent ? `the "${agent}" agent CLI` : "another AI coding agent";
  return `[route: the user wants to use ${label} — call the call_agent tool ({agent${named}, prompt}); it runs the real agent in its own harness and returns its answer. Do NOT shell out (claude -p / tmux) to launch it yourself.]`;
}
