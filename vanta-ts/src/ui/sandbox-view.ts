import type { SandboxState, DoctorCheck } from "../settings/sandbox.js";

// Pure view-shaping for the sandbox settings panel. No IO and no Ink — takes the
// effective sandbox state and produces the four tabs' display rows + their status
// glyphs, so the shaping logic is unit-testable without rendering. Mirrors mcp-view.ts.

export const SANDBOX_TABS = ["Config", "Dependencies", "Doctor", "Overrides"] as const;
export type SandboxTab = (typeof SANDBOX_TABS)[number];

/** A Config-tab row: a labelled boolean toggle. `on` drives the ●/○ glyph. */
export type ConfigRow = { label: string; on: boolean; hint: string };

/** Config toggles, in toggle order (matches Config-tab Enter targets). */
export function configRows(state: SandboxState): ConfigRow[] {
  return [
    { label: "Sandbox code runners", on: state.enabled, hint: "VANTA_SANDBOX — isolate run_code / shell" },
    { label: "Shell-only isolation", on: state.shellOnly, hint: "VANTA_SHELL_SANDBOX — sandbox shell_cmd only" },
    { label: "Allow network", on: state.allowNetwork, hint: "VANTA_SANDBOX_NET — off = no network egress" },
  ];
}

export type ToggleKeyAtIndex = "enabled" | "shellOnly" | "allowNetwork";

/** The toggle key for a Config row index (keeps the panel from hardcoding order). */
export function configToggleKey(index: number): ToggleKeyAtIndex | null {
  return (["enabled", "shellOnly", "allowNetwork"] as const)[index] ?? null;
}

/** Dependencies-tab rows — one per pre-install package. */
export function dependencyRows(state: SandboxState): string[] {
  return state.dependencies;
}

/** Doctor-tab glyph for a check level. */
export function doctorGlyph(check: DoctorCheck): string {
  if (check.level === "ok") return "✓";
  if (check.level === "warn") return "⚠";
  return "·";
}

/** An Overrides-tab row: a tool name + its current rule glyph/label. */
export type OverrideRow = { tool: string; rule: "bypass" | "enforce"; glyph: string };

/** Overrides-tab rows — one per configured per-tool rule. */
export function overrideRows(state: SandboxState): OverrideRow[] {
  return state.overrides.map((o) => ({
    tool: o.tool,
    rule: o.rule,
    glyph: o.rule === "bypass" ? "↓" : "↑",
  }));
}

/** One-line summary for the panel header (current effective mode). */
export function sandboxSummary(state: SandboxState): string {
  if (!state.enabled && !state.shellOnly) return "off";
  const parts: string[] = [];
  if (state.enabled) parts.push("code-runners");
  if (state.shellOnly) parts.push("shell");
  parts.push(state.allowNetwork ? "net-on" : "net-off");
  return parts.join(" · ");
}
