import { z } from "zod";
import { watch, type FSWatcher } from "node:fs";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { resolveVantaHome } from "../store/home.js";
import {
  buildConflictWarning,
  findKeybindingConflicts,
  type KeyBinding,
} from "./keybinding-warnings.js";

// KEYBINDING-CUSTOMIZATION — user-defined, context-scoped, chord-capable
// keybindings, layered over sensible defaults, hot-reloaded + schema-validated
// from ~/.vanta/keybindings.json. Rebuilt on the current Ink TUI (the old
// DEFAULT_BINDINGS/KeyContext registry was deleted in the 06-13 rebuild). Pure
// model + a tolerant loader; app-keys consults the resolved map to dispatch.

/** The actions the global key layer dispatches (stable ids). */
export const GLOBAL_ACTIONS = {
  exitOrAbort: "global.exitOrAbort",
  quickOpen: "global.quickOpen",
  globalSearch: "global.globalSearch",
  messageActions: "global.messageActions",
  backgroundResponse: "global.backgroundResponse",
  interrupt: "global.interrupt",
  cycleAgentNext: "global.cycleAgentNext",
  cycleAgentPrev: "global.cycleAgentPrev",
} as const;

/** Sensible defaults (global context) matching the pre-config hardcoded keys. */
export const DEFAULT_BINDINGS: KeyBinding[] = [
  { action: GLOBAL_ACTIONS.exitOrAbort, chord: "ctrl+c", context: "global" },
  { action: GLOBAL_ACTIONS.quickOpen, chord: "ctrl+p", context: "global" },
  { action: GLOBAL_ACTIONS.globalSearch, chord: "ctrl+shift+p", context: "global" },
  { action: GLOBAL_ACTIONS.messageActions, chord: "shift+up", context: "global" },
  { action: GLOBAL_ACTIONS.backgroundResponse, chord: "ctrl+b", context: "global" },
  { action: GLOBAL_ACTIONS.interrupt, chord: "escape", context: "global" },
  { action: GLOBAL_ACTIONS.cycleAgentNext, chord: "shift+right", context: "global" },
  { action: GLOBAL_ACTIONS.cycleAgentPrev, chord: "shift+left", context: "global" },
];

const MOD_ORDER = ["ctrl", "alt", "shift", "meta"];
const MOD_ALIASES: Record<string, string> = {
  cmd: "meta",
  command: "meta",
  super: "meta",
};

function normalizeChordStep(step: string): string {
  const parts = step.toLowerCase().split("+").map((p) => MOD_ALIASES[p.trim()] ?? p.trim()).filter(Boolean);
  const mods = MOD_ORDER.filter((m) => parts.includes(m));
  const keys = parts.filter((p) => !MOD_ORDER.includes(p));
  return [...mods, ...keys].join("+");
}

/** Canonical chord form; multi-step chords keep one space between steps. */
export function normalizeChord(chord: string): string {
  return chord.trim().split(/\s+/).map(normalizeChordStep).filter(Boolean).join(" ");
}

const GLYPH: Record<string, string> = { ctrl: "⌃", alt: "⌥", shift: "⇧", meta: "⌘" };

/** Human display of a chord (⌃⇧T). Pure. */
export function displayChord(chord: string): string {
  return normalizeChord(chord).split(/\s+/).map(displayChordStep).join(" ");
}

function displayChordStep(step: string): string {
  const parts = step.split("+");
  const mods = parts.filter((p) => GLYPH[p]).map((p) => GLYPH[p]).join("");
  const keys = parts.filter((p) => !GLYPH[p]).map((k) => (k.length === 1 ? k.toUpperCase() : k)).join("+");
  return mods + keys;
}

export const KeybindingConfigSchema = z.object({
  version: z.literal(1),
  bindings: z.array(z.object({ action: z.string().min(1), chord: z.string().min(1), context: z.string().min(1).default("global") })),
});
export type KeybindingConfig = z.infer<typeof KeybindingConfigSchema>;
export type KeybindingValidation = {
  path: string;
  exists: boolean;
  ok: boolean;
  errors: string[];
  warnings: string[];
  bindings: KeyBinding[];
};

export function keybindingsPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolveVantaHome(env), "keybindings.json");
}

/** Validate a config payload; null on shape mismatch. Pure. */
export function parseKeybindingConfig(payload: unknown): KeybindingConfig | null {
  const parsed = KeybindingConfigSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}

export function buildKeybindingsTemplate(bindings: readonly KeyBinding[] = DEFAULT_BINDINGS): string {
  return `${JSON.stringify({ version: 1, bindings }, null, 2)}\n`;
}

const key = (b: { action: string; context: string }): string => `${b.context}␟${b.action}`;

/**
 * Layer user overrides over defaults: an override with the same (action,
 * context) REPLACES the default chord; a new (action, context) is ADDED. Chords
 * are normalized. Deterministic order: defaults first (in place), then new
 * user bindings. Pure.
 */
export function resolveBindings(defaults: KeyBinding[], overrides: KeyBinding[]): KeyBinding[] {
  const byKey = new Map<string, KeyBinding>();
  for (const b of defaults) byKey.set(key(b), { ...b, chord: normalizeChord(b.chord) });
  const appended: KeyBinding[] = [];
  for (const o of overrides) {
    const norm = { ...o, chord: normalizeChord(o.chord) };
    if (byKey.has(key(o))) byKey.set(key(o), norm);
    else appended.push(norm);
  }
  const inOrder = defaults.map((b) => byKey.get(key(b))!);
  return [...inOrder, ...appended];
}

/**
 * The chord bound to an action in a context, falling back to a `global`
 * binding, else null. Used by the dispatcher + the shortcut-display. Pure.
 */
export function lookupChord(bindings: KeyBinding[], action: string, context = "global"): string | null {
  return (
    bindings.find((b) => b.action === action && b.context === context)?.chord ??
    bindings.find((b) => b.action === action && b.context === "global")?.chord ??
    null
  );
}

/** The action bound to a chord in a context (global fallback), or null. Pure. */
export function actionForChord(bindings: KeyBinding[], chord: string, context = "global"): string | null {
  const norm = normalizeChord(chord);
  return (
    bindings.find((b) => b.context === context && normalizeChord(b.chord) === norm)?.action ??
    bindings.find((b) => b.context === "global" && normalizeChord(b.chord) === norm)?.action ??
    null
  );
}

/** An Ink key event's boolean modifier/name flags (the subset we bind on). */
export type ChordEvent = {
  ctrl?: boolean; shift?: boolean; meta?: boolean; alt?: boolean;
  escape?: boolean; tab?: boolean; leftArrow?: boolean; rightArrow?: boolean; upArrow?: boolean; downArrow?: boolean;
};

const NAMED_KEYS: ReadonlyArray<[keyof ChordEvent, string]> = [
  ["escape", "escape"], ["tab", "tab"], ["leftArrow", "left"], ["rightArrow", "right"], ["upArrow", "up"], ["downArrow", "down"],
];

function chordModifiers(key: ChordEvent): string[] {
  return [key.ctrl && "ctrl", key.alt && "alt", key.shift && "shift", key.meta && "meta"].filter(Boolean) as string[];
}

function namedKey(key: ChordEvent): string | null {
  return NAMED_KEYS.find(([field]) => key[field])?.[1] ?? null;
}

function printableKey(input: string): string | null {
  return input && input.trim() ? input.toLowerCase() : null;
}

/**
 * Map an Ink (input, key) event to a canonical chord, or null when it isn't a
 * bindable chord (bare printable char with no modifier / named key). Pure —
 * the dispatcher feeds this to actionForChord.
 */
export function eventToChord(input: string, key: ChordEvent): string | null {
  const mods = chordModifiers(key);
  const named = namedKey(key);
  const base = named ?? printableKey(input);
  if (!base) return null;
  // A bare printable key with no modifier isn't a global chord (that's typing).
  if (!named && mods.length === 0) return null;
  return normalizeChord([...mods, base].join("+"));
}

/** Resolve the effective bindings from ~/.vanta/keybindings.json + defaults.
 * Tolerant: missing/corrupt file → just the defaults (hot-reloadable — re-call
 * to pick up an edited file). */
export async function loadKeybindings(env: NodeJS.ProcessEnv = process.env): Promise<KeyBinding[]> {
  try {
    const { readFile } = await import("node:fs/promises");
    const cfg = parseKeybindingConfig(JSON.parse(await readFile(keybindingsPath(env), "utf8")));
    return cfg ? resolveBindings(DEFAULT_BINDINGS, cfg.bindings.map((b) => ({ ...b }))) : DEFAULT_BINDINGS;
  } catch {
    return DEFAULT_BINDINGS;
  }
}

export async function validateKeybindings(env: NodeJS.ProcessEnv = process.env): Promise<KeybindingValidation> {
  const path = keybindingsPath(env);
  const { readFile } = await import("node:fs/promises");
  const raw = await readFile(path, "utf8").catch((err: NodeJS.ErrnoException) => {
    if (err.code === "ENOENT") return null;
    throw err;
  });
  if (raw === null) {
    return { path, exists: false, ok: true, errors: [], warnings: [], bindings: DEFAULT_BINDINGS };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return {
      path,
      exists: true,
      ok: false,
      errors: [`invalid JSON: ${(err as Error).message}`],
      warnings: [],
      bindings: DEFAULT_BINDINGS,
    };
  }
  const cfg = KeybindingConfigSchema.safeParse(parsed);
  if (!cfg.success) {
    return {
      path,
      exists: true,
      ok: false,
      errors: cfg.error.issues.map((issue) => `${issue.path.join(".") || "config"}: ${issue.message}`),
      warnings: [],
      bindings: DEFAULT_BINDINGS,
    };
  }
  const bindings = resolveBindings(DEFAULT_BINDINGS, cfg.data.bindings.map((b) => ({ ...b })));
  const warnings = findKeybindingConflicts(bindings).map(buildConflictWarning);
  return { path, exists: true, ok: warnings.length === 0, errors: [], warnings, bindings };
}

export async function keybindingNotices(env: NodeJS.ProcessEnv = process.env): Promise<string[]> {
  const report = await validateKeybindings(env).catch((err) => ({
    path: keybindingsPath(env),
    exists: true,
    ok: false,
    errors: [(err as Error).message],
    warnings: [],
    bindings: DEFAULT_BINDINGS,
  }));
  return [...report.errors, ...report.warnings].map((msg) => `keybindings: ${msg}`);
}

export async function writeKeybindingsTemplate(
  env: NodeJS.ProcessEnv = process.env,
  opts: { force?: boolean } = {},
): Promise<{ ok: true; path: string; wrote: boolean } | { ok: false; path: string; error: string }> {
  const path = keybindingsPath(env);
  const { access, mkdir, writeFile } = await import("node:fs/promises");
  if (!opts.force) {
    const exists = await access(path).then(() => true).catch(() => false);
    if (exists) return { ok: false, path, error: "already exists; pass --force to overwrite" };
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, buildKeybindingsTemplate(), "utf8");
  return { ok: true, path, wrote: true };
}

export function watchKeybindings(
  onChange: (bindings: KeyBinding[]) => void,
  env: NodeJS.ProcessEnv = process.env,
): () => void {
  const path = keybindingsPath(env);
  const dir = dirname(path);
  mkdirSync(dir, { recursive: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  let poller: ReturnType<typeof setInterval> | undefined;
  let lastMtime = 0;
  let watcher: FSWatcher | undefined;
  const reload = (): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      void loadKeybindings(env).then(onChange).catch(() => onChange(DEFAULT_BINDINGS));
    }, 25);
  };
  const poll = (): void => {
    void import("node:fs/promises").then((fs) => fs.stat(path)).then((s) => {
      if (s.mtimeMs === lastMtime) return;
      lastMtime = s.mtimeMs;
      reload();
    }).catch(() => undefined);
  };
  try {
    watcher = watch(dir, (_event, filename) => {
      if (!filename || String(filename) === "keybindings.json") reload();
    });
    poller = setInterval(poll, 100);
  } catch {
    return () => {};
  }
  return () => {
    if (timer) clearTimeout(timer);
    if (poller) clearInterval(poller);
    watcher?.close();
  };
}
