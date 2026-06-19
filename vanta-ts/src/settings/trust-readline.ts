import type { Interface as Readline } from "node:readline/promises";
import type { TrustConfirmer } from "./trust-gate.js";
import type { TrustRequest } from "../ui/trust-dialog.js";
import { fileSummary, previewBody, trustTitle } from "../ui/trust-dialog.js";

// Readline-host trust confirmer for the non-Ink REPL fallback (resume / --no-tui /
// non-TTY). The project default lists context-file names + line counts (not the
// full wall of text) and offers `v` to view previews; MCP shows its tool list.
// Default (non-affirmative answer) is NOT trust — fail safe.

const PREVIEW_TOOLS = 12;

/** Project summary: context files as `· name (N lines)` (no preview body). */
function projectSummary(req: Extract<TrustRequest, { kind: "project" }>): string {
  const lines = req.files.map((f) => `  · ${fileSummary(f)}`);
  return `This project ships context files Vanta would load into its prompt:\n${lines.join("\n")}`;
}

/** Project previews shown only after the operator asks to view (`v`). */
function projectPreviews(req: Extract<TrustRequest, { kind: "project" }>): string {
  return req.files
    .map((f) => `  ${f.name}\n${previewBody(f.body, 8).split("\n").map((l) => `    ${l}`).join("\n")}`)
    .join("\n");
}

function mcpSummary(req: Extract<TrustRequest, { kind: "mcp" }>): string {
  const shown = req.tools.slice(0, PREVIEW_TOOLS);
  const lines = shown.map((t) => `  · ${t.name}${t.description ? ` — ${t.description}` : ""}`);
  const more = req.tools.length > shown.length ? `\n  … (+${req.tools.length - shown.length} more)` : "";
  return `This MCP server registers ${req.tools.length} tool(s):\n${lines.join("\n")}${more}`;
}

function isYes(answer: string): boolean {
  return answer.trim().toLowerCase().startsWith("y");
}

/** Project ask: y/n/v, where v reveals previews then re-asks y/n. */
async function askProject(rl: Readline, req: Extract<TrustRequest, { kind: "project" }>): Promise<boolean> {
  const answer = await rl.question(
    `\n⚠ ${trustTitle(req)}\n${projectSummary(req)}\nTrust this project's context? (y/n, v to view) `,
  );
  if (answer.trim().toLowerCase().startsWith("v")) {
    const confirmed = await rl.question(`${projectPreviews(req)}\nTrust this and don't ask again? (y/n) `);
    return isYes(confirmed);
  }
  return isYes(answer);
}

/** Build a readline-backed trust confirmer. */
export function readlineTrustConfirmer(rl: Readline): TrustConfirmer {
  return async (req) => {
    if (req.kind === "project") return askProject(rl, req);
    const answer = await rl.question(`\n⚠ ${trustTitle(req)}\n${mcpSummary(req)}\nTrust this and don't ask again? (y/n) `);
    return isYes(answer);
  };
}
