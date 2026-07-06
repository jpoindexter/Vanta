// EXT-MEMORY-FIELD-SCHEMA — a pure-data field descriptor so a new configurable
// surface (a pluggable memory backend, a search provider, …) is added by
// DECLARING fields, not by writing bespoke setup UI + endpoint code. One generic
// renderer reads/masks values; one generic config path turns input into env
// updates. Secrets are WRITE-ONLY: resolve reports only is_set, never the value,
// and render masks them — the value goes to the env store and is never read back.

export type FieldKind = "text" | "select" | "secret";

export type FieldDescriptor = {
  /** Stable field id (used in updates + as a label fallback). */
  key: string;
  /** Human label for the renderer. */
  label: string;
  kind: FieldKind;
  /** The env var this field reads from / writes to. */
  envKey: string;
  /** Older env var names to migrate/read from (first hit wins). */
  aliases?: readonly string[];
  /** Non-migrating fallbacks read when envKey + aliases are unset (e.g. a shared key). */
  envFallbacks?: readonly string[];
  /** Allowed values for kind:"select" (input outside this set is rejected). */
  options?: readonly string[];
  /** Optional example shown by the renderer for an unset text field. */
  placeholder?: string;
};

/** A field's current state for rendering. A secret never carries its value. */
export type FieldState =
  | { kind: "text" | "select"; value: string | undefined }
  | { kind: "secret"; isSet: boolean };

/** First defined env value across envKey → aliases → envFallbacks. Pure. */
function firstEnvValue(field: FieldDescriptor, env: NodeJS.ProcessEnv): string | undefined {
  for (const key of [field.envKey, ...(field.aliases ?? []), ...(field.envFallbacks ?? [])]) {
    const v = env[key];
    if (v !== undefined && v !== "") return v;
  }
  return undefined;
}

/**
 * Resolve a field's state from env. A secret yields ONLY { isSet } — its value
 * is never returned (write-only). text/select yield the resolved value. Pure.
 */
export function resolveField(field: FieldDescriptor, env: NodeJS.ProcessEnv): FieldState {
  if (field.kind === "secret") return { kind: "secret", isSet: firstEnvValue(field, env) !== undefined };
  return { kind: field.kind, value: firstEnvValue(field, env) };
}

/** One generic display line for a field (value for text/select, masked for secret). Pure. */
export function renderField(field: FieldDescriptor, env: NodeJS.ProcessEnv): string {
  const state = resolveField(field, env);
  if (state.kind === "secret") return `  ${field.label}: ${state.isSet ? "•••• (set)" : "not set"}`;
  const shown = state.value ?? (field.placeholder ? `(e.g. ${field.placeholder})` : "not set");
  return `  ${field.label}: ${shown}`;
}

/** The generic renderer over a whole surface's field list. Pure. */
export function renderSurface(fields: readonly FieldDescriptor[], env: NodeJS.ProcessEnv): string {
  return fields.map((f) => renderField(f, env)).join("\n");
}

export type FieldUpdate = { ok: true; updates: Record<string, string> } | { ok: false; error: string };

/**
 * Turn user input for a field into an env update record (the generic config
 * path). A select validates against options; text/secret write verbatim to
 * envKey (a secret is written like any value — write-only means never READ
 * back, not never written). Empty input is rejected. Pure. */
export function fieldUpdate(field: FieldDescriptor, input: string): FieldUpdate {
  const value = input.trim();
  if (!value) return { ok: false, error: `${field.label} cannot be empty` };
  if (field.kind === "select" && field.options && !field.options.includes(value)) {
    return { ok: false, error: `${field.label} must be one of: ${field.options.join(", ")}` };
  }
  return { ok: true, updates: { [field.envKey]: value } };
}
