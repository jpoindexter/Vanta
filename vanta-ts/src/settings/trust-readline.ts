import type { Interface as Readline } from "node:readline/promises";
import type { TrustConfirmer } from "./trust-gate.js";
import type { TrustRequest } from "../ui/trust-dialog.js";
import { previewBody, trustTitle } from "../ui/trust-dialog.js";

// Readline-host trust confirmer for the non-Ink REPL fallback (resume / --no-tui /
// non-TTY). Prints the same context preview / tool list the Ink dialog shows, then
// asks a single y/n. Default (non-affirmative answer) is NOT trust — fail safe.

const PREVIEW_TOOLS = 12;

function describe(req: TrustRequest): string {
  if (req.kind === "project") {
    const blocks = req.files.map((f) => `  ${f.name}\n${previewBody(f.body, 8).split("\n").map((l) => `    ${l}`).join("\n")}`);
    return `This project ships context files loaded into Vanta's prompt:\n${blocks.join("\n")}`;
  }
  const shown = req.tools.slice(0, PREVIEW_TOOLS);
  const lines = shown.map((t) => `  · ${t.name}${t.description ? ` — ${t.description}` : ""}`);
  const more = req.tools.length > shown.length ? `\n  … (+${req.tools.length - shown.length} more)` : "";
  return `This MCP server registers ${req.tools.length} tool(s):\n${lines.join("\n")}${more}`;
}

/** Build a readline-backed trust confirmer. */
export function readlineTrustConfirmer(rl: Readline): TrustConfirmer {
  return async (req) => {
    const answer = await rl.question(`\n⚠ ${trustTitle(req)}\n${describe(req)}\nTrust this and don't ask again? (y/n) `);
    return answer.trim().toLowerCase().startsWith("y");
  };
}
