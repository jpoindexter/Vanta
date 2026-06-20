/**
 * VANTA-OUTPUT-STYLE-DIR — custom output styles from markdown files (PURE).
 *
 * Mirrors the Claude Code `.claude/output-styles/*.md` model (the global `jason`
 * output style is the concept): a markdown file with flat `name`/`description`
 * frontmatter + a body that becomes a system-prompt behavior section. Styles are
 * discoverable in two dirs (project `.claude/output-styles/` + user
 * `~/.vanta/output-styles/`), one is selected by name (arg / env / settings), and
 * its body is injected as a `# Output Style: <name>` block.
 *
 * Everything here is PURE + injectable — the dir/file readers are passed in, so no
 * real disk is touched in tests. No style selected = no injection (the default).
 *
 * NOT WIRED into the live prompt build this round (deliberate). When wired,
 * `outputStyleSection(resolveOutputStyle(...))` becomes a PromptTier in
 * `prompt.ts` PROMPT_TIERS (e.g. after `stable`, before `self`), and
 * buildSystemPrompt threads the selected style through BuildPromptOptions —
 * mirroring how the cyber-risk / clarity rules fold into the stable tier. A null
 * style renders "" and is dropped by the existing `.filter(Boolean)`.
 */
import { homedir } from "node:os";
import { join } from "node:path";

/** A parsed output style: a named behavior block for the system prompt. */
export type OutputStyle = {
  /** Style name — from frontmatter `name`, else a slug of the filename/body. */
  name: string;
  /** One-line description from frontmatter `description` (empty if absent). */
  description: string;
  /** The markdown body (frontmatter stripped) that becomes the behavior block. */
  body: string;
};

/** Anchored frontmatter block: opening fence, the block, closing fence. The
 *  lazy body capture lets the FIRST "\n---" close it; no second fence => no
 *  match => the whole input is the body (the no-frontmatter case). Mirrors
 *  skills/frontmatter.ts. */
const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?/;

/** Reduce a string to a safe lowercase slug; empty input → "output-style". */
function slugify(raw: string): string {
  const slug = raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\-_ ]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "output-style";
}

/** Read flat "key: value" frontmatter lines into {name, description}. Split on
 *  the FIRST colon only (values may contain colons). Unknown keys ignored. */
function parseFrontmatter(block: string): { name: string; description: string } {
  let name = "";
  let description = "";
  for (const line of block.split("\n")) {
    const sep = line.indexOf(":");
    if (sep === -1) continue;
    const key = line.slice(0, sep).trim();
    const value = line.slice(sep + 1).trim();
    if (key === "name") name = value;
    else if (key === "description") description = value;
  }
  return { name, description };
}

/**
 * Parse an output-style markdown file into an {@link OutputStyle} (PURE).
 * The leading `---\n…\n---\n` frontmatter (if any) yields `name`/`description`;
 * the remainder is the trimmed body. Tolerant: with no frontmatter, or a
 * frontmatter that omits `name`, the name falls back to a slug (of `fallback`
 * when given — typically the filename — else the body's first line).
 */
export function parseOutputStyle(fileText: string, fallback = ""): OutputStyle {
  const match = fileText.match(FRONTMATTER_RE);
  const front = match ? parseFrontmatter(match[1] ?? "") : { name: "", description: "" };
  const body = (match ? fileText.slice(match[0].length) : fileText).trim();
  const slugSource = fallback.trim() || (body.split("\n")[0] ?? "");
  return {
    name: front.name.trim() || slugify(slugSource),
    description: front.description.trim(),
    body,
  };
}

/** Deps for listing/resolving styles — injected so no real disk in tests. */
export type OutputStyleDeps = {
  /** The directories to scan, in precedence order (earlier wins on name clash). */
  dirs: string[];
  /** List the `*.md` file basenames in a dir (return [] for a missing dir). */
  listMd: (dir: string) => string[];
  /** Read a file's text (return null for a missing/unreadable file). */
  readText: (path: string) => string | null;
};

/** Strip a trailing `.md` (case-insensitive) for use as the slug fallback. */
function stripMd(file: string): string {
  return file.replace(/\.md$/i, "");
}

/**
 * List the available output styles across the injected dirs (PURE over deps).
 * Earlier dirs win on a name collision (project overrides user). Files that
 * read as null are skipped. Order: discovery order within precedence.
 */
export function listOutputStyles(deps: OutputStyleDeps): OutputStyle[] {
  const byName = new Map<string, OutputStyle>();
  for (const dir of deps.dirs) {
    for (const file of deps.listMd(dir)) {
      if (!/\.md$/i.test(file)) continue;
      const text = deps.readText(join(dir, file));
      if (text === null) continue;
      const style = parseOutputStyle(text, stripMd(file));
      const key = style.name.toLowerCase();
      // First writer wins → earlier dirs (project) override later (user).
      if (!byName.has(key)) byName.set(key, style);
    }
  }
  return [...byName.values()];
}

/** How a style name is chosen, in precedence order. */
export type OutputStyleSelection = {
  /** Explicit override (e.g. a CLI flag). Highest precedence. */
  name?: string;
  /** Process env (reads `VANTA_OUTPUT_STYLE`). */
  env?: NodeJS.ProcessEnv;
  /** Settings-provided name (injected — this module never reads settings/disk). */
  settingsName?: string;
};

/** Resolve the selected style name from the precedence chain, or null. */
function selectedName(sel: OutputStyleSelection): string | null {
  const explicit = sel.name?.trim();
  if (explicit) return explicit;
  const fromEnv = sel.env?.VANTA_OUTPUT_STYLE?.trim();
  if (fromEnv) return fromEnv;
  const fromSettings = sel.settingsName?.trim();
  if (fromSettings) return fromSettings;
  return null;
}

/**
 * Resolve the selected output style, or null when none is selected (PURE).
 * The name comes from the precedence chain (arg → `VANTA_OUTPUT_STYLE` →
 * settings); matching is case-insensitive against each style's `name`.
 * No selection, or a name that matches nothing, → null → no injection.
 */
export function resolveOutputStyle(
  selection: OutputStyleSelection,
  deps: OutputStyleDeps,
): OutputStyle | null {
  const want = selectedName(selection);
  if (!want) return null;
  const target = want.toLowerCase();
  return listOutputStyles(deps).find((s) => s.name.toLowerCase() === target) ?? null;
}

/**
 * Format a style as the system-prompt behavior block (PURE).
 * `null` → "" (no injection — the default behavior). This is the string a
 * PromptTier would contribute; an empty result is dropped by the assembly's
 * existing `.filter(Boolean)`.
 */
export function outputStyleSection(style: OutputStyle | null): string {
  if (!style?.body.trim()) return "";
  return `# Output Style: ${style.name}\n${style.body.trim()}`;
}

/**
 * Default style directories: the project's `.claude/output-styles/` (highest
 * precedence) then the user's `~/.vanta/output-styles/`. Pure given `root`/`home`
 * (both injectable for tests; `home` defaults to the real home dir). A wiring
 * site builds {@link OutputStyleDeps} from this plus real `listMd`/`readText`.
 */
export function defaultStyleDirs(root: string, home: string = homedir()): string[] {
  return [join(root, ".claude", "output-styles"), join(home, "output-styles")];
}
