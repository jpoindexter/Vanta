import { PROVIDER_CATALOG } from "../providers/catalog.js";
import { THEME_NAMES } from "../term/theme.js";
import type { SessionMeta } from "../sessions/store.js";
import type { Skill } from "../skills/types.js";

// Pure builders for the inline overlays. Every selectable row carries the slash
// COMMAND it runs — so picking a session/skill/model/theme reduces to the same
// runSlash path the typed command uses, and the two can never diverge. cockpit
// + help are read-only panels (no rows).

export type OverlayKind = "model" | "sessions" | "skills" | "theme" | "cockpit" | "help" | "loops" | "review";
/** `mark` is an optional status glyph (● current) shown in its own column, left
 * of the label and distinct from the ❯ selection cursor. */
export type OverlayRow = { label: string; hint?: string; command: string; mark?: string };

/** Bare slash commands that open an inline overlay instead of printing text. */
export const PICKER_KINDS: Readonly<Record<string, OverlayKind>> = {
  model: "model", setup: "model", sessions: "sessions", skills: "skills", theme: "theme", cockpit: "cockpit", help: "help",
  loops: "loops", changes: "review",
};

export function sessionRows(sessions: SessionMeta[]): OverlayRow[] {
  return sessions.map((s) => ({ label: `${s.id}  ${s.turns} turn(s)`, hint: s.title, command: `/resume ${s.id}` }));
}

export function skillRows(skills: Skill[]): OverlayRow[] {
  return skills.map((s) => ({ label: s.meta.name, hint: s.meta.description, command: `/${s.meta.name}` }));
}

export function modelRows(currentProviderId: string): OverlayRow[] {
  return PROVIDER_CATALOG.map((p) => ({
    mark: p.id === currentProviderId ? "●" : undefined,
    label: p.short,
    hint: p.defaultModel,
    command: `/model ${p.id}`,
  }));
}

export function themeRows(current: string): OverlayRow[] {
  return THEME_NAMES.map((t) => ({ mark: t === current ? "●" : undefined, label: t, command: `/theme ${t}` }));
}
