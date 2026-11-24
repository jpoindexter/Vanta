import { ARTIFACT_MAX_CHARS } from "./constants.js";
import { event, isHeartbeat, type OutputParser } from "./parser.js";

// For CLIs that print plain text: every line is progress, and the whole output
// is the final message. Exit status alone decides success; no usage is reported.

export function createTextParser(): OutputParser {
  const lines: string[] = [];
  let size = 0;
  return {
    feed(line) {
      if (isHeartbeat(line)) return [event("status", line.slice(2))];
      if (!line.trim()) return [];
      if (size < ARTIFACT_MAX_CHARS) { lines.push(line); size += line.length + 1; }
      return [event("message", line)];
    },
    result: () => ({ failed: false, finalMessage: lines.join("\n").trim() || undefined }),
  };
}
