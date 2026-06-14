import { toolProgressMode } from "../repl/tool-progress.js";
import type { AgentDeps } from "../agent.js";

// Live tool-activity console printers shared by `vanta run` + the REPL. Extracted
// from session.ts (size gate). Re-exported from session.js so callers import it
// from there unchanged.

function shortArgs(args: Record<string, unknown>): string {
  const s = JSON.stringify(args);
  return s.length > 80 ? `${s.slice(0, 77)}...` : s;
}

function firstLine(text: string): string {
  const line = text.split("\n")[0] ?? "";
  return line.length > 100 ? `${line.slice(0, 97)}...` : line;
}

/** Live tool-activity printers shared by run + chat. Verbosity: VANTA_TOOL_PROGRESS. */
export function consoleCallbacks(env: NodeJS.ProcessEnv = process.env): Pick<
  AgentDeps,
  "onText" | "onToolCall" | "onToolResult"
> {
  const mode = toolProgressMode(env);
  return {
    onText: (t) => console.log(t),
    onToolCall: (n, a) => { if (mode === "full") console.log(`  → ${n}(${shortArgs(a)})`); },
    onToolResult: (n, ok, out) => {
      if (mode === "off") return;
      console.log(`  ${ok ? "✓" : "✗"} ${n}: ${firstLine(out)}`);
      // Print the live checklist every time the agent updates it.
      if (n === "todo" && ok && out.includes("done)")) {
        console.log(out.split("\n").map((l) => `  ${l}`).join("\n"));
      }
    },
  };
}
