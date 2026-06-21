// TOOL-CALL-REPAIR — fix malformed/partial tool-call arguments from weak/local
// models BEFORE they fail zod validation and waste a turn. Pure: a ladder of
// JSON-repair strategies, then schema-aware coercion (string→number/bool) and
// default-fill. Vanta runs local + small open models, where this matters most.

export interface RepairResult {
  args: Record<string, unknown>;
  repaired: boolean; // true if a strategy beyond plain JSON.parse was needed
  strategy: string; // which strategy succeeded (for logging)
}

const asObject = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

// Strip ```json fences a model sometimes wraps args in.
function stripFences(s: string): string {
  return s.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
}

// Extract the first balanced {...} object (ignoring braces inside strings).
function firstObject(s: string): string | null {
  const start = s.indexOf("{");
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (esc) { esc = false; continue; }
    if (c === "\\") { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return s.slice(start, i + 1);
  }
  return null; // unbalanced (truncated)
}

// Best-effort cleanup of near-JSON: trailing commas, single quotes, py literals,
// unquoted keys.
function looseFix(s: string): string {
  return s
    .replace(/,(\s*[}\]])/g, "$1") // trailing commas
    .replace(/\bTrue\b/g, "true").replace(/\bFalse\b/g, "false").replace(/\bNone\b/g, "null")
    .replace(/'([^'\\]*)'(\s*[:,}\]])/g, '"$1"$2') // 'val' → "val"
    .replace(/([{,]\s*)'([^'\\]+)'(\s*:)/g, '$1"$2"$3') // 'key': → "key":
    .replace(/([{,]\s*)([A-Za-z_]\w*)(\s*:)/g, '$1"$2"$3'); // bareKey: → "key":
}

// Close a truncated object: balance strings, brackets, braces at the tail.
const CLOSER: Record<string, string> = { "{": "}", "[": "]" };
function completeTruncated(s: string): string {
  let inStr = false, esc = false;
  const stack: string[] = []; // holds the CLOSER chars, in order
  for (const c of s) {
    if (esc) { esc = false; continue; }
    if (c === "\\") { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (CLOSER[c]) stack.push(CLOSER[c]);
    else if ("}]".includes(c)) stack.pop();
  }
  let out = s.replace(/,\s*$/, "");
  if (inStr) out += '"';
  while (stack.length) out += stack.pop();
  return out;
}

function tryParse(s: string): Record<string, unknown> | null {
  try { return asObject(JSON.parse(s)); } catch { return null; }
}

// The strategy ladder, each building on the last; repairToolArgs tries them in order.
function repairCandidates(input: string): Array<[string, string]> {
  const stripped = stripFences(input);
  const obj = firstObject(stripped);
  const loose = looseFix(obj ?? stripped);
  return [
    ["fences", stripped],
    ["extract-object", obj ?? ""],
    ["loose-fix", loose],
    ["complete-truncated", completeTruncated(loose)],
  ];
}

/** Parse tool-call argument JSON, repairing common weak-model malformations. */
export function repairToolArgs(raw: string | undefined | null): RepairResult {
  const input = (raw ?? "").trim();
  if (!input || input === "{}") return { args: {}, repaired: false, strategy: "empty" };

  const direct = tryParse(input);
  if (direct) return { args: direct, repaired: false, strategy: "json" };

  for (const [strategy, cand] of repairCandidates(input)) {
    if (!cand) continue;
    const parsed = tryParse(cand);
    if (parsed) return { args: parsed, repaired: true, strategy };
  }
  // Unrecoverable: empty args beat {_raw} — zod then yields a clean "missing field"
  // error the model can act on, instead of an opaque type error.
  return { args: {}, repaired: true, strategy: "unrecoverable" };
}

interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchema>;
  default?: unknown;
  enum?: unknown[];
}

function coerceNumber(v: unknown, type?: string): unknown {
  if (typeof v !== "string" || v.trim() === "" || isNaN(Number(v))) return v;
  return type === "integer" ? Math.trunc(Number(v)) : Number(v);
}

function coerceBool(v: string): boolean | string {
  if (/^(true|yes|1)$/i.test(v)) return true;
  if (/^(false|no|0)$/i.test(v)) return false;
  return v;
}

function coerceScalar(v: unknown, type?: string): unknown {
  if (type === "number" || type === "integer") return coerceNumber(v, type);
  if (type === "boolean" && typeof v === "string") return coerceBool(v);
  if (type === "string" && typeof v === "number") return String(v);
  return v;
}

/** Coerce string→number/bool against a JSON schema and fill declared defaults. */
export function coerceToSchema(
  args: Record<string, unknown>,
  schema: JsonSchema | undefined,
): Record<string, unknown> {
  const props = schema?.properties;
  if (!props) return args;
  const out: Record<string, unknown> = { ...args };
  for (const [key, spec] of Object.entries(props)) {
    if (key in out) out[key] = coerceScalar(out[key], spec.type);
    else if (spec.default !== undefined) out[key] = spec.default;
  }
  return out;
}

/** One call: repair the JSON, then coerce against the tool's parameter schema. */
export function repairAndCoerce(
  raw: string | undefined | null,
  schema?: JsonSchema,
): RepairResult {
  const r = repairToolArgs(raw);
  return { ...r, args: coerceToSchema(r.args, schema) };
}
