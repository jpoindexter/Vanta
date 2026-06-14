/** Pretty-print JSON found in shell/tool output for readability in the transcript.
 *  - If the ENTIRE trimmed output parses as a JSON object/array → return it
 *    pretty-printed (JSON.stringify(parsed, null, 2)).
 *  - Otherwise, scan line by line: any line whose trimmed form parses as a JSON
 *    object or array (starts with { or [) is replaced by its pretty-printed form
 *    (preserving the line's leading indentation prefix on the first line);
 *    non-JSON lines are left exactly as-is (e.g. plain logs, JSONL is each line
 *    expanded).
 *  - BOUNDED: if output.length > maxLen (default 20000) return it unchanged
 *    (don't blow up the transcript on a huge blob). Also leave unchanged if no
 *    JSON is found. Never throw — JSON.parse failures fall through to as-is. */

const DEFAULT_MAX_LEN = 20_000;

function tryParseJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}

function isObjectOrArray(v: unknown): v is object {
  return v !== null && typeof v === "object";
}

function prettyLine(line: string): string {
  const trimmed = line.trimStart();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return line;
  const parsed = tryParseJson(trimmed);
  if (!isObjectOrArray(parsed)) return line;
  const indent = line.slice(0, line.length - trimmed.length);
  const pretty = JSON.stringify(parsed, null, 2);
  return pretty
    .split("\n")
    .map((l, i) => (i === 0 ? indent + l : l))
    .join("\n");
}

function tryWholeOutput(trimmed: string): string | undefined {
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return undefined;
  const parsed = tryParseJson(trimmed);
  if (!isObjectOrArray(parsed)) return undefined;
  return JSON.stringify(parsed, null, 2);
}

export function formatJsonInOutput(
  output: string,
  maxLen: number = DEFAULT_MAX_LEN,
): string {
  if (output.length > maxLen) return output;

  const trimmed = output.trim();
  const whole = tryWholeOutput(trimmed);
  if (whole !== undefined) return whole;

  const lines = output.split("\n");
  const hasJson = lines.some((l) => {
    const t = l.trimStart();
    return (t.startsWith("{") || t.startsWith("[")) &&
      isObjectOrArray(tryParseJson(t));
  });
  if (!hasJson) return output;

  return lines.map(prettyLine).join("\n");
}
