// SKILL-CONDITIONAL-ACTIVATE — conditional skill activation on file edit. A skill
// whose frontmatter declares `activateOn` path globs is surfaced/activated for a
// turn when the agent edits or reads a matching file. Like SKILL-TOOL-POLICY, this
// reads the RAW parsed-frontmatter object directly, NOT SkillMeta: `skills/
// frontmatter.ts` parseMeta is a closed shape and drops unknown keys, so the
// `activateOn` field never survives into SkillMeta — the resolver here mines the
// raw YAML record.
//
// PURE: a frontmatter parser + a small self-contained glob matcher + the "which
// skills activate for this path" resolution. No I/O, no LLM. The glob is anchored
// (full-path match), case-sensitive, and treated as a literal pattern — never
// compiled from caller text in a way that allows regex injection or path traversal
// (every regex-special char in a glob is escaped; only `*`/`**`/`?` are wildcards).
//
// Not wired into the live edit/read or skill-selection path this round (delivered
// as the pure matcher + resolution + tests). NAMED wire-up points (mirrors how
// clarity-gate / tool-policy name their consumers — the kernel still gates every
// tool call; this only surfaces which skills are relevant to a touched path):
//   1. FILE-TOUCH (the write_file / read_file dispatch in `agent.ts dispatchTool`,
//      where a tool's `path` arg is known): after a successful read/write, call
//      `skillsForEditedPath(skillGlobs, path)` to get the skill names whose
//      `activateOn` globs match the touched file. `skillGlobs` is built once per
//      session by reading each skill's raw frontmatter through `parseActivateGlobs`.
//   2. SKILL-INDEX (`skills/select.ts selectSkillsForTask`, where SkillIndexEntry[]
//      becomes the model-facing index): UNION the path-activated names from step 1
//      into the selected set BEFORE returning, so a skill matched by the edited
//      file is surfaced for the turn even if the task text alone wouldn't rank it.
//      A skill with no `activateOn` is never path-activated (unchanged); a path that
//      matches nothing activates nothing.

/**
 * Coerce a raw frontmatter `activateOn` value into a clean glob list, or `[]`.
 *
 * Tolerant by design (an author/LLM boundary): a non-array (string, number,
 * object, null, absent) => `[]` (the skill is never path-activated — unchanged
 * behavior). Within a real array, non-string and blank entries are dropped and the
 * rest are trimmed + deduped, preserving first-seen order. Globs are kept verbatim
 * (case-sensitive, matched literally by {@link matchGlob}); they are NOT lowered or
 * normalized. Pure.
 */
export function parseActivateGlobs(frontmatter: Record<string, unknown>): string[] {
  const value = frontmatter.activateOn;
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of value) {
    if (typeof raw !== "string") continue;
    const glob = raw.trim();
    if (glob.length === 0 || seen.has(glob)) continue;
    seen.add(glob);
    out.push(glob);
  }
  return out;
}

/** Regex-special chars (other than the glob wildcards `*` `?`) that must be
 * escaped so a glob is matched LITERALLY — no regex injection from author text. */
const REGEX_SPECIAL = /[.+^${}()|[\]\\]/;

/**
 * Compile a glob into an anchored RegExp source, char-by-char so a wildcard's
 * substitution is never re-scanned as a glob token. Supported wildcards:
 *   - `**` across path segments: a leading `**​/` (or a `/​**` tail) spans zero or
 *     more `dir/` segments; a bare `**` matches anything including separators.
 *   - `*` within a single segment: any run of non-`/` chars.
 *   - `?` a single non-`/` char.
 * Everything else is a literal (regex-special chars escaped). Pure; case-sensitive.
 */
function globToSource(glob: string): string {
  let src = "";
  let i = 0;
  while (i < glob.length) {
    const ch = glob[i]!;
    if (ch === "*") {
      if (glob[i + 1] === "*") {
        if (glob[i + 2] === "/") {
          // `**/` — zero or more leading path segments (so `**/*.rs` matches `x.rs`).
          src += "(?:[^/]+/)*";
          i += 3;
        } else if (glob[i - 1] === "/") {
          // `/**` tail — the slash already consumed; match the rest, segments or empty.
          src += ".*";
          i += 2;
        } else {
          // bare `**` — anything, including separators.
          src += ".*";
          i += 2;
        }
      } else {
        // single `*` — non-separator chars only (stays within one segment).
        src += "[^/]*";
        i += 1;
      }
    } else if (ch === "?") {
      // single non-separator char.
      src += "[^/]";
      i += 1;
    } else if (REGEX_SPECIAL.test(ch)) {
      src += `\\${ch}`;
      i += 1;
    } else {
      src += ch;
      i += 1;
    }
  }
  return src;
}

/**
 * Whether `glob` matches `path` as a full anchored, case-sensitive match. `*`
 * stays within a segment (so `*.test.ts` matches `foo.test.ts` but NOT
 * `a/foo.test.ts`); `**` spans segments (`**​/*.rs` matches `a/b/c.rs` and `x.rs`);
 * `src/safety/**` matches `src/safety/mod.rs` but not `src/other.rs`; `?` is one
 * non-separator char; everything else is literal. Pure. The glob is treated
 * literally — a glob can never inject regex or escape the path being matched.
 */
export function matchGlob(glob: string, path: string): boolean {
  return new RegExp(`^${globToSource(glob)}$`).test(path);
}

/** A skill's path-activation rule: its name + the `activateOn` globs (possibly []). */
export type SkillGlobs = {
  readonly name: string;
  readonly globs: readonly string[];
};

/**
 * Whether ANY of `globs` matches `path`. An empty list (a skill without
 * `activateOn`) is never activated => false; no glob matching the path => false.
 * Pure.
 */
export function pathActivates(globs: readonly string[], path: string): boolean {
  return globs.some((g) => matchGlob(g, path));
}

/**
 * The names of the skills whose `activateOn` globs match `path` — i.e. which
 * skills activate when this file is edited/read. Order follows `skillGlobs`
 * (deduped by name on first match). A skill with no globs is never activated; a
 * path that matches nothing yields []. Pure.
 */
export function skillsForEditedPath(skillGlobs: readonly SkillGlobs[], path: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const { name, globs } of skillGlobs) {
    if (seen.has(name)) continue;
    if (pathActivates(globs, path)) {
      seen.add(name);
      out.push(name);
    }
  }
  return out;
}
