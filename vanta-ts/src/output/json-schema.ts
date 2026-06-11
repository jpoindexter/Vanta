import { readFileSync } from "node:fs";

export type SchemaValidationResult =
  | { valid: true; data: unknown }
  | { valid: false; errors: string[] };

/** Load a JSON Schema from a file path or an inline JSON string. */
export function loadJsonSchema(pathOrInline: string): Record<string, unknown> {
  const src = pathOrInline.trim().startsWith("{")
    ? pathOrInline
    : readFileSync(pathOrInline, "utf8");
  const parsed: unknown = JSON.parse(src);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
    throw new Error("JSON Schema must be a JSON object");
  return parsed as Record<string, unknown>;
}

/** Null-safe wrapper: returns undefined when src is falsy. */
export function loadSchema(src: string | undefined): Record<string, unknown> | undefined {
  return src ? loadJsonSchema(src) : undefined;
}

function findBalancedBlock(text: string): string | null {
  const starts = [text.indexOf("{"), text.indexOf("[")].filter((i) => i >= 0);
  if (!starts.length) return null;
  const start = Math.min(...starts);
  const [open, close] = text[start] === "{" ? ["{", "}"] : ["[", "]"];
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === open) depth++;
    else if (text[i] === close && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

/** Extract JSON from model output — fenced block, raw JSON, or first balanced block. */
export function extractJson(text: string): { found: true; data: unknown } | { found: false } {
  const t = text.trim();
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try { return { found: true, data: JSON.parse(fenced[1]!.trim()) }; } catch { /* fall through */ }
  }
  try { return { found: true, data: JSON.parse(t) }; } catch { /* fall through */ }
  const block = findBalancedBlock(t);
  if (!block) return { found: false };
  try { return { found: true, data: JSON.parse(block) }; } catch { return { found: false }; }
}

function pathJoin(parent: string, key: string): string {
  return parent ? `${parent}.${key}` : key;
}

function checkRequired(obj: Record<string, unknown>, required: string[], path: string): string[] {
  return required.filter((k) => !(k in obj)).map((k) => `${pathJoin(path, k)}: required field missing`);
}

const SCALAR_TYPES: Record<string, string> = { string: "string", number: "number", boolean: "boolean" };

function checkType(data: unknown, schema: Record<string, unknown>, path: string): string[] {
  const type = schema["type"] as string | undefined;
  if (!type) return [];
  if (type === "object") return checkObject(data, schema, path);
  if (type === "array") return checkArray(data, schema, path);
  if (type === "null") return data !== null ? [`${path}: expected null, got ${typeof data}`] : [];
  const jsType = SCALAR_TYPES[type];
  if (jsType && typeof data !== jsType) return [`${path}: expected ${jsType}, got ${typeof data}`];
  return [];
}

function checkObject(data: unknown, schema: Record<string, unknown>, path: string): string[] {
  if (typeof data !== "object" || data === null || Array.isArray(data))
    return [`${path}: expected object, got ${Array.isArray(data) ? "array" : typeof data}`];
  const obj = data as Record<string, unknown>;
  const required = (schema["required"] as string[] | undefined) ?? [];
  const properties = (schema["properties"] as Record<string, Record<string, unknown>> | undefined) ?? {};
  const errors = checkRequired(obj, required, path);
  for (const [k, propSchema] of Object.entries(properties)) {
    if (k in obj) errors.push(...checkType(obj[k], propSchema, pathJoin(path, k)));
  }
  return errors;
}

function checkArray(data: unknown, schema: Record<string, unknown>, path: string): string[] {
  if (!Array.isArray(data)) return [`${path}: expected array, got ${typeof data}`];
  const items = schema["items"] as Record<string, unknown> | undefined;
  if (!items) return [];
  return data.flatMap((item, i) => checkType(item, items, `${path}[${i}]`));
}

/** Validate a JSON value against a simplified JSON Schema subset.
 *  Supports: type, required, properties, items. Ignores $ref / oneOf / etc. */
export function validateAgainstSchema(data: unknown, schema: Record<string, unknown>): string[] {
  return checkType(data, schema, "");
}

/** Extract JSON from model output text, then validate it against the schema. */
export function validateOutput(text: string, schema: Record<string, unknown>): SchemaValidationResult {
  const extracted = extractJson(text);
  if (!extracted.found) return { valid: false, errors: ["no valid JSON found in response"] };
  const errors = validateAgainstSchema(extracted.data, schema);
  return errors.length > 0 ? { valid: false, errors } : { valid: true, data: extracted.data };
}

/** Build a system-prompt suffix that instructs the model to output JSON matching the schema. */
export function buildSchemaInstruction(schema: Record<string, unknown>): string {
  return (
    `\n\nIMPORTANT: Your response MUST be a valid JSON object matching this JSON Schema. ` +
    `Output ONLY the JSON — no explanation, no markdown fences, no other text.\n\n` +
    `Schema:\n${JSON.stringify(schema, null, 2)}`
  );
}

type SchemaSend = {
  send: (text: string) => Promise<{ finalText: string; stoppedReason: string; iterations: number; toolIterations: number }>;
};

const SCHEMA_MAX_RETRIES = 3;

/** Send instruction with schema constraint; retries up to SCHEMA_MAX_RETRIES on validation failure. */
export async function sendWithSchemaRetry(
  convo: SchemaSend,
  instruction: string,
  schema: Record<string, unknown>,
): Promise<{ finalText: string; stoppedReason: string; iterations: number; toolIterations: number }> {
  let outcome = await convo.send(`${instruction}${buildSchemaInstruction(schema)}`);
  for (let attempt = 0; attempt < SCHEMA_MAX_RETRIES; attempt++) {
    const result = validateOutput(outcome.finalText, schema);
    if (result.valid) return { ...outcome, finalText: JSON.stringify(result.data, null, 2) };
    if (attempt === SCHEMA_MAX_RETRIES - 1) break;
    const errs = (result as { valid: false; errors: string[] }).errors.join("\n");
    outcome = await convo.send(`Invalid JSON. Schema errors:\n${errs}\nRespond with ONLY valid JSON.`);
  }
  return outcome;
}
