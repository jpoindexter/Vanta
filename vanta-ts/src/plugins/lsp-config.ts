import { z } from "zod";

/**
 * A plugin-declared LSP server config: a language → the server command argv
 * and the file extensions it serves. Vanta's built-in LSP is TS-only
 * (`lsp/ts-service.ts`); this lets an enabled plugin add others (python,
 * rust, …) by declaring them in its `plugin.json` manifest under `lsp`.
 *
 * SECURITY: this module only RESOLVES configs from manifests — it never
 * spawns. The actual server spawn is the documented boundary and is still
 * subject to the kernel/plugin trust gate at spawn time (`assess()`), exactly
 * like every other plugin-contributed runtime capability.
 */
export type PluginLspConfig = {
  language: string;
  command: string[];
  extensions: string[];
};

/** A clash report: a later plugin tried to claim a language already taken. */
export type LspLanguageClash = {
  language: string;
  keptCommand: string[];
  droppedCommand: string[];
};

/** The merged outcome of resolving across plugins. */
export type LspResolution = {
  configs: PluginLspConfig[];
  clashes: LspLanguageClash[];
};

/**
 * Per-config schema. Tolerant by composition: the *array* read in
 * `parsePluginLsp` is `.safeParse`d so a bad entry drops rather than throwing.
 * `language` is trimmed-non-empty; `command`/`extensions` are non-empty argv
 * lists of non-empty strings (validate the command — a config with no argv to
 * spawn is useless and dropped).
 */
const NonEmptyString = z.string().trim().min(1);

const PluginLspConfigSchema = z
  .object({
    language: NonEmptyString,
    command: z.array(NonEmptyString).min(1),
    extensions: z.array(NonEmptyString).min(1),
  })
  .strict();

/** Normalize a file extension to a leading-dot, lowercased form (`.ts`). */
function normalizeExt(ext: string): string {
  const trimmed = ext.trim().toLowerCase();
  if (!trimmed) return "";
  return trimmed.startsWith(".") ? trimmed : `.${trimmed}`;
}

function normalizeConfig(parsed: z.infer<typeof PluginLspConfigSchema>): PluginLspConfig {
  return {
    language: parsed.language.trim(),
    command: parsed.command.map((c) => c.trim()),
    extensions: parsed.extensions.map(normalizeExt).filter((e) => e.length > 0),
  };
}

/**
 * Read an optional `lsp` array off a parsed plugin manifest (a plain record;
 * NOT routed through the strict `PluginManifestSchema`, which rejects unknown
 * keys). Absent / non-array / garbage → []. Each entry is validated; invalid
 * entries are dropped, not thrown.
 */
export function parsePluginLsp(manifest: unknown): PluginLspConfig[] {
  if (!manifest || typeof manifest !== "object") return [];
  const raw = (manifest as Record<string, unknown>).lsp;
  if (!Array.isArray(raw)) return [];
  const out: PluginLspConfig[] = [];
  for (const entry of raw) {
    const result = PluginLspConfigSchema.safeParse(entry);
    if (!result.success) continue;
    const config = normalizeConfig(result.data);
    if (config.extensions.length === 0) continue; // all extensions normalized away
    out.push(config);
  }
  return out;
}

/** A config has a usable command iff its argv is non-empty after trimming. */
function hasValidCommand(config: PluginLspConfig): boolean {
  return config.command.length > 0 && config.command.every((c) => c.length > 0);
}

/**
 * Merge per-plugin LSP config lists into one deduped set. First plugin (and,
 * within a plugin, first entry) wins on a language clash; the loser is reported
 * in `clashes` rather than silently dropped. Only configs with a valid command
 * survive — an empty-argv config can't spawn a server.
 *
 * Input order = plugin precedence order (the caller passes enabled plugins in
 * load order, so the earliest-loaded plugin owns a contested language).
 */
export function resolveLspServers(pluginLspLists: PluginLspConfig[][]): LspResolution {
  const byLanguage = new Map<string, PluginLspConfig>();
  const clashes: LspLanguageClash[] = [];
  for (const list of pluginLspLists) {
    for (const config of list) {
      if (!hasValidCommand(config)) continue;
      const key = config.language.toLowerCase();
      const existing = byLanguage.get(key);
      if (existing) {
        clashes.push({
          language: config.language,
          keptCommand: existing.command,
          droppedCommand: config.command,
        });
        continue;
      }
      byLanguage.set(key, config);
    }
  }
  return { configs: [...byLanguage.values()], clashes };
}

/**
 * The config serving a given file extension, or null. Tolerant of an `ext`
 * with or without a leading dot and of case (`ts`, `.TS`, `.ts` all match a
 * config that declared `.ts`). First matching config wins.
 */
export function lspForExtension(configs: PluginLspConfig[], ext: string): PluginLspConfig | null {
  const target = normalizeExt(ext);
  if (!target) return null;
  for (const config of configs) {
    if (config.extensions.includes(target)) return config;
  }
  return null;
}
