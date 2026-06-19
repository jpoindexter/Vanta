import { dirname } from "node:path";
import { loadSettings } from "../settings/store.js";
import {
  sandboxState, sandboxDoctor, type SandboxState, type DoctorCheck,
} from "../settings/sandbox.js";
import { doctorGlyph } from "../ui/sandbox-view.js";
import type { SlashHandler } from "./types.js";

// /sandbox — the four-tab settings UI is a TUI overlay (ui/sandbox-panel.tsx).
// In the readline REPL (no Ink), print the same data as text so it stays useful
// headless: the effective Config flags, pre-install deps, the Doctor report, and
// per-tool overrides. Pure formatter over the shared sandbox state.

/** Format the effective sandbox state as a text block (REPL fallback for the panel). */
export function formatSandbox(state: SandboxState, doctor: DoctorCheck[]): string {
  return [
    "  Sandbox settings (panel is a TUI view — run `vanta` and type /sandbox)",
    "",
    "  Config",
    `    ${flag(state.enabled)} code-runner sandbox   (VANTA_SANDBOX)`,
    `    ${flag(state.shellOnly)} shell-only isolation  (VANTA_SHELL_SANDBOX)`,
    `    ${flag(state.allowNetwork)} allow network         (VANTA_SANDBOX_NET)`,
    "",
    `  Dependencies (${state.dependencies.length})`,
    ...depLines(state.dependencies),
    "",
    "  Doctor",
    ...doctor.map((c) => `    ${doctorGlyph(c)} ${c.label}: ${c.detail}`),
    "",
    `  Overrides (${state.overrides.length})`,
    ...overrideLines(state),
  ].join("\n");
}

const flag = (on: boolean): string => (on ? "[on] " : "[off]");

function depLines(deps: string[]): string[] {
  return deps.length === 0 ? ["    (none)"] : deps.map((d) => `    • ${d}`);
}

function overrideLines(state: SandboxState): string[] {
  if (state.overrides.length === 0) return ["    (none)"];
  return state.overrides.map((o) => `    ${o.rule === "bypass" ? "↓" : "↑"} ${o.tool}  ${o.rule}`);
}

export const sandbox: SlashHandler = async (_arg, ctx) => {
  const repoRoot = dirname(ctx.dataDir);
  const settings = await loadSettings(repoRoot, ctx.env);
  const state = sandboxState(settings, ctx.env);
  return { output: formatSandbox(state, sandboxDoctor(state, process.platform)) };
};
