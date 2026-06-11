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

/** Extract JSON from model output — fenced block, raw JSON, or first balanced block. */
export function extractJson(text: string): { found: true; data: unknown } | { found: false } {
  const trimmed = text.trim();

  // Fenced ```json ... ``` block
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    try {
      return { found: true, data: JSON.parse(fencedMatch[1].trim()) };
    } catch { /* fall through */ }
  }

  // Direct parse (model output is raw JSON)
  try {
    return { found: true, data: JSON.parse(trimmed) };
  } catch { /* fall through */ }

  // Find first balanced { or [ in the text
  const starts = [trimmed.indexOf("{"), trimmed.indexOf("[")].filter((i) => i >= 0);
  if (starts.length === 0) return { found: false };
  const start = Math.min(...starts);
  const open = trimmed[start] === "{" ? ["{", "}"] : ["[", "]"];
  let depth = 0;
  for (let i = start; i < trimmed.length; i++) {
    if (trimmed[i] === open[0]) depth++;
    else if (trimmed[i] === open[1]) { depth--; if (depth === 0) {
      try {
        return { found: true, data: JSON.parse(trimmed.slice(start, i + 1)) };
      } catch { return { found: false }; }
    }}
  }
  return { found: false };
}

function checkType(data: unknown, schema: Record<string, unknown>, path: string): string[] {
  const type = schema["type"] as string | undefined;
  if (!type) return [];
  if (type === "object") return checkObject(data, schema, path);
  if (type === "array") return checkArray(data, schema, path);
  if (type === "string" && typeof data !== "string")
    return [`${path}: expected string, got ${typeof data}`];
  if (type === "number" && typeof data !== "number")
    return [`${path}: expected number, got ${typeof data}`];
  if (type === "boolean" && typeof data !== "boolean")
    return [`${path}: expected boolean, got ${typeof data}`];
  if (type === "null" && data !== null)
    return [`${path}: expected null, got ${typeof data}`];
  return [];
}

function checkObject(data: unknown, schema: Record<string, unknown>, path: string): string[] {
  if (typeof data !== "object" || data === null || Array.isArray(data))
    return [`${path}: expected object, got ${Array.isArray(data) ? "array" : typeof data}`];
  const obj = data as Record<string, unknown>;
  const errors: string[] = [];
  const required = (schema["required"] as string[] | undefined) ?? [];
  for (const key of required) {
    if (!(key in obj)) errors.push(`${path ? `${path}.` : ""}${key}: required field missing`);
  }
  const properties = (schema["properties"] as Record<string, Record<string, unknown>> | undefined) ?? {};
  for (const [key, propSchema] of Object.entries(properties)) {
    if (key in obj) errors.push(...checkType(obj[key], propSchema, path ? `${path}.${key}` : key));
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
