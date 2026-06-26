// VANTA-AGENT-ROUTING-DISCOVERY — route "talk to / start / use another coding
// agent" intent to the `call_agent` tool. Root cause from the 2026-06-25 session:
// Vanta has call_agent (drives claude/codex/gemini/cursor-agent/opencode) but the
// model never reached for it — it shelled out (`claude -p`, `tmux`) and dead-ended
// on the auto-sandbox. Mirrors mode-detect.ts: a one-line hint prepended to the
// turn so the model picks the purpose-built tool instead of raw shell.

// A use/talk verb sitting near a known-agent name → intent to DRIVE that agent.
const VERB_NEAR_AGENT =
  /\b(talk to|speak to|chat with|ask|start(?:\s+up)?|spin up|launch|use|run|call|open|fire up|delegate to|hand (?:off|it) to|interact with|connect (?:to|with)|coordinate with|drive|control|pair with|bridge to)\b[\s\S]{0,30}\b(claude|codex|gemini|cursor|opencode)\b/i;
// An explicit external-agent reference — strong enough to route with no verb.
const STRONG =
  /\b(claude code|cursor[- ]agent|opencode|another (?:ai )?agent|other agent|second agent|a (?:different|separate) agent|sub-?agents?|agent[- ]to[- ]agent|\ba2a\b|another ai|second ai)\b/i;
// A known-agent name qualified as a CLI/agent/session → an external agent, not a model id.
const AGENT_AS_CLI =
  /\b(claude|codex|gemini|cursor|opencode)\b[\s\S]{0,20}\b(cli|agent|terminal|session|harness)\b/i;
// Build/implement verbs → the delegated agent must actually WRITE code (coding:true),
// not just answer. Drives the route hint toward call_agent(coding:true) + a verify step.
const BUILD =
  /\b(build|make|create|implement|develop|scaffold|generate|code up|write (?:me )?(?:a|an|the|some)\b|set up|put (?:it|them|the \w+) in|fix the|refactor|add (?:a|an|the) \w)/i;
// A build verb sitting near an agent name ("have claude build…") is delegation intent even
// without a use/talk verb — "claude" alone isn't strong, but "claude … build" is.
const BUILD_NEAR_AGENT =
  /\b(claude|codex|gemini|cursor|opencode)\b[\s\S]{0,24}\b(build|make|create|implement|write|code|develop|scaffold|fix|refactor)\b/i;

/** True when the message expresses intent to use another coding agent. Pure. */
export function hasAgentIntent(text: string): boolean {
  return STRONG.test(text) || VERB_NEAR_AGENT.test(text) || AGENT_AS_CLI.test(text) || BUILD_NEAR_AGENT.test(text);
}

/** True when the (agent) task is to BUILD/implement something — needs coding:true. Pure. */
export function hasBuildIntent(text: string): boolean {
  return BUILD.test(text);
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
  const label = agent ? `the "${agent}" agent` : "another AI agent";
  const building = hasBuildIntent(text);
  const codingArg = building ? ", coding:true" : "";
  const buildNote = building
    ? ` This is a BUILD task: pass coding:true so ${label} actually writes/changes files (it streams live progress + returns what it built), then VERIFY the result (read the files / run a check) before reporting done.`
    : "";
  return `[route: the user wants you to drive ${label}. You CAN — use the call_agent tool ({agent${named}, prompt${codingArg}}) for a one-shot, or agent_session (open/send/read/close) to hold a back-and-forth.${buildNote} Do NOT claim you "can't", "lack a handle/bridge", or "can't control a terminal from this harness" — that is FALSE; you have these tools, use them. Never shell out (claude -p / tmux) yourself.]`;
}
