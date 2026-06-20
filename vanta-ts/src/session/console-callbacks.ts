import { toolProgressMode } from "../repl/tool-progress.js";
import { recordOutput } from "../recording/session-recorder.js";
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

/** Print one line to the terminal AND tee it into the asciicast recorder when
 * one is active. console.log adds a trailing newline, so the recorded chunk
 * mirrors what the terminal sees. recordOutput is a no-op when not recording,
 * keeping non-recording output byte-identical. */
function emit(line: string): void {
  console.log(line);
  recordOutput(line + "\n");
}

/** Live tool-activity printers shared by run + chat. Verbosity: VANTA_TOOL_PROGRESS. */
export function consoleCallbacks(env: NodeJS.ProcessEnv = process.env): Pick<
  AgentDeps,
  "onText" | "onToolCall" | "onToolResult"
> {
  const mode = toolProgressMode(env);
  return {
    onText: (t) => emit(t),
    onToolCall: (n, a) => { if (mode === "full") emit(`  → ${n}(${shortArgs(a)})`); },
    onToolResult: (n, ok, out) => {
      if (mode === "off") return;
      emit(`  ${ok ? "✓" : "✗"} ${n}: ${firstLine(out)}`);
      // Print the live checklist every time the agent updates it.
      if (n === "todo" && ok && out.includes("done)")) {
        emit(out.split("\n").map((l) => `  ${l}`).join("\n"));
      }
    },
  };
}
