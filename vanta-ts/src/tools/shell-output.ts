import type { ToolResult } from "./types.js";
import { parseVantaHints, formatHintSuggestion } from "../hints/vanta-hints.js";
import { limitOutput, resolveMaxOutput } from "./bash-output-limit.js";
import { shouldShowTiming, buildTimingNote } from "./shell-timing.js";
import { formatJsonInOutput } from "../term/json-format.js";

// Pure output/result formatting for shell_cmd. Extracted from shell-cmd.ts (size
// gate). NONE of this touches the gating/assess/sandbox decision path — it only
// shapes captured stdout/stderr/exit/timing into a ToolResult. shell-cmd.ts
// re-exports lastCommandWord/classifyExitCode so external importers stay unchanged.

export type RunError = { code?: number | string; stdout?: string; stderr?: string; message: string };

/** Combine captured stdout/stderr into the tool output, stripping any subprocess
 *  plugin-hint tags from stderr and appending an install suggestion so the model
 *  never sees the raw tag, then bounding the size (head+tail with a truncation
 *  marker) so a multi-megabyte dump can't flood the context. No hint tag and
 *  output under the limit → byte-identical to the plain join. */
export function combineOutput(stdout: string | undefined, stderr: string | undefined): string {
  const { hints, stripped } = parseVantaHints(stderr ?? "");
  const joined = [stdout, stripped].filter(Boolean).join("\n").trim();
  const out = hints.length === 0 ? joined : appendSuggestion(joined, hints);
  // VANTA-SHELL-JSON-FORMAT: opt-in pretty-print of JSON lines (bounded, never throws,
  // non-JSON unchanged). Default off = byte-identical join.
  const shaped = process.env.VANTA_JSON_FORMAT === "1" ? formatJsonInOutput(out) : out;
  return limitOutput(shaped, resolveMaxOutput(process.env));
}

/** Append a plugin-install suggestion line (kept separate so combineOutput stays small). */
function appendSuggestion(out: string, hints: ReturnType<typeof parseVantaHints>["hints"]): string {
  const suggestion = formatHintSuggestion(hints);
  return suggestion ? [out, suggestion].filter(Boolean).join("\n") : out;
}

/** Build the result for a non-zero/failed run: reclassify benign exits, else error. */
export function formatRunFailure(command: string, e: RunError, pfx: string): ToolResult {
  const out = combineOutput(e.stdout, e.stderr);
  // A numeric exit code means the command ran (vs. ENOENT/timeout, where code is
  // a string/undefined and we keep it an error). Reclassify no-match/differs/partial.
  if (typeof e.code === "number") {
    const cls = classifyExitCode(command, e.code);
    if (cls.ok) return { ok: true, output: pfx + (out ? `${cls.note}\n${out}` : `(${cls.note})`) };
  }
  return { ok: false, output: pfx + (out || e.message) };
}

/**
 * The program whose exit code we actually received: the first token of the
 * LAST segment of a pipeline/chain (`a | grep x`, `find . && echo`), since the
 * shell reports that command's status. `git grep`/`git diff` keep both words;
 * a leading path (`/usr/bin/grep`) is stripped to its basename.
 */
export function lastCommandWord(command: string): string {
  const seg = command.split(/&&|\|\||;|\|/).pop() ?? command;
  const tok = seg.trim().split(/\s+/).filter(Boolean);
  let w = tok[0] ?? "";
  if (w === "git" && tok[1]) w = `git ${tok[1]}`;
  return w.replace(/^.*\//, "");
}

/**
 * Per-command exit-code semantics. grep/rg/find/diff
 * exit 1 is a valid *outcome*, not a failure — treating it as an error makes
 * the agent see false failures and retry needlessly. Returns ok=true (with an
 * info note) for those cases; everything else stays a real error.
 */
export function classifyExitCode(command: string, code: number): { ok: boolean; note?: string } {
  let w = lastCommandWord(command);
  if (w.startsWith("git ")) w = w.slice(4);
  if (code === 1) {
    if (["grep", "rg", "egrep", "fgrep", "ripgrep"].includes(w)) return { ok: true, note: "No matches found" };
    if (w === "diff") return { ok: true, note: "Differences found" };
    if (w === "find") return { ok: true, note: "Some paths were inaccessible" };
  }
  return { ok: false };
}

/** Append a "(took <elapsed>)" line when the run was slow enough to surface.
 *  Observational only — the ok/exit/result is untouched; a fast run (under the
 *  threshold) returns the result byte-identical. */
export function withTimingNote(result: ToolResult, elapsedMs: number): ToolResult {
  if (!shouldShowTiming(elapsedMs)) return result;
  const note = buildTimingNote(elapsedMs);
  const output = result.output ? `${result.output}\n${note}` : note;
  return { ...result, output };
}
