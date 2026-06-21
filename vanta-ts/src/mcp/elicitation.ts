// VANTA-MCP-ELICITATION — turn an MCP server's elicitation request (2025-11-05
// spec: `params.message` + `params.requestedSchema`) into an operator-facing
// prompt, then validate the operator's typed input back into the elicitation
// RESPONSE the host must send the server.
//
// This module is PURE: parse → prompt → validate, plus the cancel shape. No
// transport, no kernel, no IO — it unit-tests against inline fixtures. The live
// `mcp/events.ts onElicitation` (today an always-cancel stub) would call:
//   1. `parseElicitationRequest(params)`        — read the server's ask
//   2. `buildElicitationPrompt(request)`        — render it for the operator
//   3. (host prompts the operator via an injected prompter)
//   4. `validateElicitationResponse(fields, raw)` — coerce + validate the reply
//   5. an empty/unsupported schema OR a declined prompt → `elicitationCancel()`
// SECURITY: the server-supplied `message`/field text is UNTRUSTED — it is
// control-stripped before it reaches the operator's terminal, and nothing is
// ever auto-filled or executed; we only collect operator-typed input.

/** The three primitive field types the 2025-11-05 elicitation schema supports. */
export type ElicitationFieldType = "string" | "number" | "boolean";

/** One field the server wants the operator to fill (parsed from the schema). */
export type ElicitationField = {
  name: string;
  type: ElicitationFieldType;
  description?: string;
  required: boolean;
};

/** A parsed elicitation request: the operator-facing message + the fields. */
export type ElicitationRequest = {
  message: string;
  fields: ElicitationField[];
};

/** The validated elicitation response — the shape the host returns to the server. */
export type ElicitationResponse =
  | { action: "accept"; content: Record<string, unknown> }
  | { action: "decline" }
  | { action: "cancel"; content: Record<string, unknown>; reason: string };

/** Raw operator input keyed by field name (what an injected prompter collects). */
export type RawElicitationInput = Record<string, string | undefined>;

const DEFAULT_CANCEL_REASON = "MCP elicitation UI is not available in this host";
const MAX_TEXT = 500;
// Full ANSI escape sequences: ESC \u001b followed by a CSI/OSC/etc. body. Removed
// whole so no escape-sequence residue (e.g. "[31m") leaks into the operator's
// terminal. eslint-disable: the leading ESC is an intentional control char.
// eslint-disable-next-line no-control-regex
const ANSI_ESCAPE = /\u001b[@-_][0-?]*[ -/]*[@-~]?/g;
// Remaining C0 controls, DEL \u007f, and C1 controls \u0080-\u009f. Intentional
// control-char regex - removing them IS the point.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/g;

/**
 * Control-strip untrusted server text: first remove whole ANSI escape sequences
 * (no "[31m"-style residue), then drop any remaining ASCII/C1 control chars
 * (incl. a bare ESC) and DEL, collapse whitespace runs to single spaces, trim,
 * and cap length. Returns "" for a non-string. Pure — the single defense for
 * every server-supplied string before it reaches the operator's terminal.
 */
export function stripControl(text: unknown): string {
  if (typeof text !== "string") return "";
  return text
    .replace(ANSI_ESCAPE, "")
    .replace(CONTROL_CHARS, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TEXT);
}

/** Coerce a raw JSON-schema `type` to one of our three primitives (default string). */
function coerceFieldType(raw: unknown): ElicitationFieldType {
  if (raw === "number" || raw === "integer") return "number";
  if (raw === "boolean") return "boolean";
  return "string";
}

/** Read one property entry from `requestedSchema.properties` into a field. Pure. */
function parseField(name: string, prop: unknown, required: Set<string>): ElicitationField {
  const obj = prop && typeof prop === "object" ? (prop as Record<string, unknown>) : {};
  const description = stripControl(obj.description);
  return {
    name,
    type: coerceFieldType(obj.type),
    ...(description ? { description } : {}),
    required: required.has(name),
  };
}

/**
 * Parse an MCP elicitation request's `params` into `{message, fields}`. Tolerant
 * of a missing/empty/malformed schema → `fields: []`. `params.message` is
 * control-stripped; `requestedSchema.properties` becomes the field list, with
 * `requestedSchema.required[]` flagging required fields. Pure, never throws.
 */
export function parseElicitationRequest(params: unknown): ElicitationRequest {
  const p = params && typeof params === "object" ? (params as Record<string, unknown>) : {};
  const message = stripControl(p.message);
  const schema = p.requestedSchema;
  const schemaObj = schema && typeof schema === "object" ? (schema as Record<string, unknown>) : {};
  const props = schemaObj.properties;
  const propsObj = props && typeof props === "object" ? (props as Record<string, unknown>) : {};
  const requiredList = Array.isArray(schemaObj.required) ? schemaObj.required : [];
  const required = new Set(requiredList.filter((r): r is string => typeof r === "string"));
  const fields = Object.keys(propsObj).map((name) => parseField(name, propsObj[name], required));
  return { message, fields };
}

/** Render one field as a numbered prompt line, e.g. `1. url (string, required) — the doc URL`. */
function fieldLine(field: ElicitationField, index: number): string {
  const flag = field.required ? "required" : "optional";
  const desc = field.description ? ` — ${field.description}` : "";
  return `${index + 1}. ${field.name} (${field.type}, ${flag})${desc}`;
}

/**
 * Build the operator-facing prompt text: the (already control-stripped) message
 * followed by a numbered field list. All text is control-safe by construction
 * (the request came through `parseElicitationRequest`). Pure.
 */
export function buildElicitationPrompt(request: ElicitationRequest): string {
  const header = request.message || "An MCP server is requesting input.";
  if (request.fields.length === 0) return header;
  const lines = request.fields.map(fieldLine);
  return `${header}\n\n${lines.join("\n")}`;
}

/** Coerce a raw string to the field's type. Returns undefined on an unparseable value. */
function coerceValue(field: ElicitationField, raw: string): unknown {
  const trimmed = raw.trim();
  if (field.type === "number") {
    const n = Number(trimmed);
    return trimmed !== "" && Number.isFinite(n) ? n : undefined;
  }
  if (field.type === "boolean") {
    const lower = trimmed.toLowerCase();
    if (["true", "yes", "y", "1"].includes(lower)) return true;
    if (["false", "no", "n", "0"].includes(lower)) return false;
    return undefined;
  }
  return trimmed === "" ? undefined : trimmed;
}

/**
 * Validate operator input against the parsed fields and produce the elicitation
 * RESPONSE. Each present field is coerced by its type; a present-but-unparseable
 * or absent REQUIRED field → `{action:"decline"}` (the operator could not / did
 * not supply it — the safe answer). Absent OPTIONAL fields are simply omitted
 * from `content`. A valid set → `{action:"accept", content}`. Pure, never throws.
 */
export function validateElicitationResponse(
  fields: ElicitationField[],
  rawInput: RawElicitationInput,
): ElicitationResponse {
  const content: Record<string, unknown> = {};
  for (const field of fields) {
    const raw = rawInput[field.name];
    if (raw === undefined || raw.trim() === "") {
      if (field.required) return { action: "decline" };
      continue; // absent optional → omit
    }
    const value = coerceValue(field, raw);
    if (value === undefined) {
      if (field.required) return { action: "decline" };
      continue; // unparseable optional → omit
    }
    content[field.name] = value;
  }
  return { action: "accept", content };
}

/**
 * The cancel response — the current always-cancel default. Used for an
 * unsupported/empty schema the host can't render, or any host-side abort.
 * `reason` is control-stripped (it may be surfaced); pure.
 */
export function elicitationCancel(reason?: string): Extract<ElicitationResponse, { action: "cancel" }> {
  return { action: "cancel", content: {}, reason: stripControl(reason) || DEFAULT_CANCEL_REASON };
}
