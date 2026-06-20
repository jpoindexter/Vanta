// VANTA-STANDALONE-AGENT-NAME — a custom name + color identity for a single
// (non-swarm) agent session, so multiple terminals/sessions running Vanta are
// visually distinguishable at a glance.
//
// PURE + presentation-only: this module resolves an identity from env/settings
// and does NOT touch the render layer. The NAMED wire-in point is the launch
// banner / prompt persona: ui/banner.tsx renders the literal "Vanta" wordmark +
// tagline today (the WORDMARK const, the only place the session's name shows).
// The renderer would call resolveAgentIdentity(process.env, settingsName) once
// at launch and, when isCustomIdentity(identity) is true, label the banner with
// identity.name in identity.color (and the prompt persona would refer to itself
// by identity.name) so two terminals read as e.g. a cyan "Atlas" and a green
// "Mercury" instead of two identical "Vanta"s. Unset = the default identity
// ("Vanta", default color) — exactly current behavior.
//
// Mirrors ui/teammate-color.ts: the same stable id→color palette assigns a
// custom name its color when one isn't given, so the SAME name always reads as
// the SAME color across sessions/terminals. Colors are literal Ink color strings
// (the codebase's no-theme decision — see DECISIONS 2026-06-17).

import { teammateColor } from "./teammate-color.js";

/** The default session name when no custom name is configured. */
export const DEFAULT_AGENT_NAME = "Vanta";

/**
 * The default session color — the terminal-default foreground (the launch
 * wordmark renders `bold` with no explicit color, i.e. near-white). Using the
 * literal Ink color "white" keeps the default identity color a valid Ink color
 * (so formatAgentIdentity/consumers always have a real color to apply) while
 * still reading as the terminal's default bright foreground.
 */
export const DEFAULT_AGENT_COLOR = "white";

/** Max rendered name length — long enough for a real label, short enough to not
 * wrap a banner line or dominate a prompt. */
const MAX_NAME_LENGTH = 24;

/** A resolved standalone-session identity: a display name + a valid Ink color. */
export interface AgentIdentity {
  readonly name: string;
  readonly color: string;
}

/** The default identity — what an unconfigured session is (current behavior). */
export const DEFAULT_IDENTITY: AgentIdentity = {
  name: DEFAULT_AGENT_NAME,
  color: DEFAULT_AGENT_COLOR,
};

/**
 * Strip ANSI escape sequences and control characters from a name, collapse
 * internal whitespace, trim, and cap the length. Pure + total: any string in →
 * a safe single-line label out (possibly empty, which the caller treats as
 * "no name given"). An LLM/env/settings boundary, so it's sanitized like one.
 */
export function sanitizeAgentName(raw: string): string {
  // ANSI CSI / escape sequences (ESC + [ + params + final byte) → removed.
  // eslint-disable-next-line no-control-regex
  const ansiStripped = raw.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "");
  // C0 controls (incl. lone ESC/tab/newline) + C1 controls (0x80-0x9f) → a space,
  // so a tab/newline/escape can never break a banner line or sneak into a prompt.
  // eslint-disable-next-line no-control-regex
  const controlStripped = ansiStripped.replace(/[\x00-\x1f\x7f-\x9f]/g, " ");
  const collapsed = controlStripped.replace(/\s+/g, " ").trim();
  return collapsed.slice(0, MAX_NAME_LENGTH).trim();
}

/** The named colors Ink (via chalk) accepts as foreground colors, plus their
 * bright variants. Lowercased for case-insensitive matching. */
const NAMED_INK_COLORS: ReadonlySet<string> = new Set([
  "black", "red", "green", "yellow", "blue", "magenta", "cyan", "white", "gray", "grey",
  "blackbright", "redbright", "greenbright", "yellowbright",
  "bluebright", "magentabright", "cyanbright", "whitebright",
]);

/**
 * Whether a string is a usable Ink color: a named ANSI color, a hex color
 * (`#rgb`/`#rrggbb`), or an `rgb()`/`hsl()`/`ansi`/`ansi256` form Ink accepts.
 * Pure + total. A bad value (typo, empty, arbitrary text) → false, so the caller
 * falls back to a derived/default color rather than handing Ink an invalid color.
 */
export function isValidInkColor(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (v.length === 0) return false;
  if (NAMED_INK_COLORS.has(v)) return true;
  if (/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/.test(v)) return true;
  if (/^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/.test(v)) return true;
  if (/^hsl\(\s*\d{1,3}\s*,\s*\d{1,3}%?\s*,\s*\d{1,3}%?\s*\)$/.test(v)) return true;
  if (/^ansi(?:256)?$/.test(v)) return true;
  return false;
}

/**
 * Resolve the standalone session identity from env + optional settings name.
 *
 * Name precedence: `VANTA_AGENT_NAME` > `settingsName` > {@link DEFAULT_AGENT_NAME}.
 * Each candidate is sanitized; an empty result falls through to the next source.
 *
 * Color precedence: a valid `VANTA_AGENT_COLOR` > a stable color derived from the
 * resolved name (via {@link teammateColor}, so the same name always reads as the
 * same color) when a CUSTOM name is set > {@link DEFAULT_AGENT_COLOR} for the
 * default name. A bad `VANTA_AGENT_COLOR` is ignored (never an invalid Ink color
 * reaches a consumer).
 *
 * Pure + total: same inputs → same identity. Unset env + no settings name → the
 * default identity (current behavior). Errors-as-values via fallthrough — never
 * throws, never returns an invalid color.
 */
export function resolveAgentIdentity(
  env: NodeJS.ProcessEnv,
  settingsName?: string,
): AgentIdentity {
  const name = resolveName(env.VANTA_AGENT_NAME, settingsName);
  const color = resolveColor(env.VANTA_AGENT_COLOR, name);
  return { name, color };
}

/** Name from the first non-empty sanitized source, else the default. Pure. */
function resolveName(envName: string | undefined, settingsName: string | undefined): string {
  const fromEnv = envName ? sanitizeAgentName(envName) : "";
  if (fromEnv.length > 0) return fromEnv;
  const fromSettings = settingsName ? sanitizeAgentName(settingsName) : "";
  if (fromSettings.length > 0) return fromSettings;
  return DEFAULT_AGENT_NAME;
}

/** Color by precedence: valid env color > name-derived (custom name) > default. */
function resolveColor(envColor: string | undefined, name: string): string {
  if (envColor && isValidInkColor(envColor)) return envColor.trim();
  if (name !== DEFAULT_AGENT_NAME) return teammateColor(name);
  return DEFAULT_AGENT_COLOR;
}

/**
 * Whether an identity differs from the default — i.e. the session was given a
 * custom name or color. Drives whether the banner/persona shows a distinguishing
 * label at all. Pure + total.
 */
export function isCustomIdentity(identity: AgentIdentity): boolean {
  return identity.name !== DEFAULT_IDENTITY.name || identity.color !== DEFAULT_IDENTITY.color;
}

/**
 * A compact one-line label for display — the name only (the color travels on the
 * identity for the renderer to apply, e.g. `<Text color={identity.color}>`).
 * Pure + total.
 */
export function formatAgentIdentity(identity: AgentIdentity): string {
  return identity.name;
}
