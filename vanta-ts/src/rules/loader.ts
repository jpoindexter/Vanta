// CC-RULES — path-scoped rule files from .vanta/rules/*.md.
// Rule files may carry YAML frontmatter with a `paths:` field (glob list).
// Rules without `paths:` are always-on; those with `paths:` are injected only
// when at least one of the active files matches one of the globs.

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RuleFile = {
  /** Absolute path to the .md file. */
  path: string;
  /** Full content (frontmatter stripped). */
  content: string;
  /**
   * Glob patterns from the `paths:` frontmatter field.
   * Undefined → always-on rule (no path scope).
   */
  paths?: string[];
};

// ---------------------------------------------------------------------------
// Frontmatter parser
// ---------------------------------------------------------------------------

// Opening fence, lazy frontmatter block, closing fence — mirrors skills/frontmatter.ts.
const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?/;

/** Parse "[ src/**\/*.ts, lib/**\/*.ts ]" or bare "a, b" into a string list. */
function parsePaths(value: string): string[] {
  const inner = value.replace(/^\[(.*)\]$/s, "$1");
  return inner
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
}

type ParsedFrontmatter = { paths?: string[] };

function parseFrontmatter(block: string): ParsedFrontmatter {
  const result: ParsedFrontmatter = {};
  for (const line of block.split("\n")) {
    const sep = line.indexOf(":");
    if (sep === -1) continue;
    const key = line.slice(0, sep).trim();
    const value = line.slice(sep + 1).trim();
    if (key === "paths") result.paths = parsePaths(value);
    // Unknown keys are ignored.
  }
  return result;
}

function parseRuleFile(filePath: string, raw: string): RuleFile {
  const match = raw.match(FRONTMATTER_RE);
  if (!match) {
    return { path: filePath, content: raw.trim() };
  }
  const fm = parseFrontmatter(match[1] ?? "");
  return {
    path: filePath,
    content: raw.slice(match[0].length).trim(),
    ...(fm.paths !== undefined ? { paths: fm.paths } : {}),
  };
}

// ---------------------------------------------------------------------------
// Glob → regex converter
// ---------------------------------------------------------------------------

/**
 * Converts a glob pattern to a RegExp for path matching.
 * Supports double-star (any path segments, including zero) and single-star (non-slash chars).
 * No external dependency required.
 *
 * Processed character-by-character so wildcard substitution strings are never
 * re-processed as glob tokens (avoids the regex-in-replacement collision).
 */
export function globToRegex(glob: string): RegExp {
  // Regex-special chars that must be escaped (not including * which we handle).
  const SPECIAL = /[.+^${}()|[\]\\]/;
  let result = "^";
  let i = 0;
  while (i < glob.length) {
    const ch = glob[i]!;
    if (ch === "*") {
      if (glob[i + 1] === "*") {
        if (glob[i + 2] === "/") {
          // `**/` — zero or more path segments (e.g. src/**/*.ts matches src/foo.ts)
          result += "(?:[^/]+/)*";
          i += 3;
        } else {
          // trailing `**` — anything
          result += ".*";
          i += 2;
        }
      } else {
        // single `*` — non-separator chars only
        result += "[^/]*";
        i += 1;
      }
    } else if (SPECIAL.test(ch)) {
      result += `\\${ch}`;
      i += 1;
    } else {
      result += ch;
      i += 1;
    }
  }
  result += "$";
  return new RegExp(result);
}

/** Returns true if `filePath` matches any of the glob patterns. */
function matchesAny(filePath: string, globs: string[]): boolean {
  return globs.some((g) => globToRegex(g).test(filePath));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load all rule files from `<dataDir>/rules/*.md`.
 * Returns an empty array when the directory is missing or contains no `.md` files.
 */
export async function loadRules(dataDir: string): Promise<RuleFile[]> {
  const rulesDir = join(dataDir, "rules");
  let entries: string[];
  try {
    entries = await readdir(rulesDir);
  } catch {
    return [];
  }
  const mdFiles = entries.filter((e) => e.endsWith(".md")).sort();
  const rules: RuleFile[] = [];
  for (const name of mdFiles) {
    try {
      const filePath = join(rulesDir, name);
      const raw = await readFile(filePath, "utf8");
      rules.push(parseRuleFile(filePath, raw));
    } catch {
      // skip unreadable files
    }
  }
  return rules;
}

/**
 * Build a prompt injection string from the loaded rules.
 *
 * - Always-on rules (no `paths:`) are always included.
 * - Path-scoped rules are included only when at least one of `activeFiles`
 *   matches one of the rule's glob patterns.
 *
 * Returns an empty string when no rules apply.
 */
export function rulesTier(rules: RuleFile[], activeFiles?: string[]): string {
  const applicable = rules.filter((r) => {
    if (!r.paths) return true; // always-on
    if (!activeFiles?.length) return false; // no active files → scoped rules excluded
    return matchesAny(activeFiles.join("\n"), r.paths) ||
      activeFiles.some((f) => matchesAny(f, r.paths!));
  });
  if (applicable.length === 0) return "";
  const blocks = applicable.map((r) => r.content.trim()).filter(Boolean);
  return blocks.length === 0 ? "" : `Project rules:\n\n${blocks.join("\n\n")}`;
}
