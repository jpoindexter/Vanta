/**
 * VANTA-LAUNCHPAD — ground a task in a real source doc before acting.
 *
 * Before Vanta generates or reaches for a tool, it should launch FROM something:
 * a PRD/ROADMAP, a ticket, a local file. Without one it launches from thin air.
 * This module is the pure grounding layer:
 *
 *  - `extractScope(sourceText)` reads a PRD-like doc with heuristics (headings,
 *    capitalized noun phrases, "must/should" constraints, bullet items) into a
 *    structured {entities, scope, constraints}.
 *  - `buildLaunchpadBrief(source, extracted)` renders a grounding brief string the
 *    agent references in its plan before the first tool call.
 *  - `seedFromSource(path, readFile)` reads a named doc through an INJECTED fs and
 *    returns the extraction as a value (errors-as-values; never throws).
 *
 * Everything here is pure except `seedFromSource`, whose only side effect (the
 * read) is injected so the whole surface is unit-testable without the filesystem.
 */

/** The shape extracted from a source doc — what to scope the task to before acting. */
export type ExtractedScope = {
  /** Named things the work touches: headings + capitalized noun phrases, deduped, ranked by salience. */
  entities: string[];
  /** Scope statements: the in-scope bullets / lines that bound what the task covers. */
  scope: string[];
  /** Hard constraints: lines carrying must / should / never / required obligations. */
  constraints: string[];
};

/** A read failure surfaced as a value (errors-as-values — `seedFromSource` never throws). */
export type SeedError = { ok: false; error: string };
/** A successful seed: the source path + text it grounded on, and the extraction. */
export type SeedResult = { ok: true; path: string; source: string; extracted: ExtractedScope };

/** Injected file reader so `seedFromSource` stays testable without touching disk. */
export type ReadFile = (path: string) => Promise<string>;

/** Caps so a huge doc can't blow the brief / prompt budget. */
const MAX_ENTITIES = 12;
const MAX_SCOPE = 10;
const MAX_CONSTRAINTS = 10;

/** Words that signal an obligation — a line carrying one is a constraint. */
const CONSTRAINT_WORDS: readonly string[] = Object.freeze([
  "must",
  "should",
  "shall",
  "never",
  "always",
  "required",
  "require",
  "cannot",
  "do not",
  "don't",
  "only",
]);

/** Headings/lines that mark the section as OUT of scope — their bullets are excluded from scope. */
const OUT_OF_SCOPE_MARKERS: readonly string[] = Object.freeze([
  "out of scope",
  "out-of-scope",
  "non-goal",
  "not in scope",
  "parked",
]);

/** Stop-words that, alone, are noise — never an entity on their own. */
const ENTITY_STOPWORDS: ReadonlySet<string> = new Set([
  "The",
  "This",
  "That",
  "These",
  "Those",
  "A",
  "An",
  "It",
  "We",
  "I",
  "You",
  "They",
  "Done",
  "Why",
  "What",
  "When",
  "Where",
  "How",
]);

/** Split into trimmed, non-empty lines. Pure. */
function lines(text: string): string[] {
  return text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
}

/** A markdown/setext heading → its text, else null. Pure. */
function headingText(line: string): string | null {
  const hash = /^#{1,6}\s+(.+?)\s*#*$/.exec(line);
  return hash?.[1] ? hash[1].trim() : null;
}

/** A bullet/numbered list item → its text, else null. Pure. */
function bulletText(line: string): string | null {
  const m = /^(?:[-*+]|\d+[.)])\s+(.+)$/.exec(line);
  return m?.[1] ? m[1].trim() : null;
}

/** Strip markdown emphasis/links/code so entity matching sees plain words. Pure. */
function plainText(text: string): string {
  return text
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, "$1")
    .trim();
}

/** True when the line carries an obligation word (case-insensitive, word-ish boundaries). Pure. */
function isConstraintLine(line: string): boolean {
  const lower = ` ${line.toLowerCase()} `;
  return CONSTRAINT_WORDS.some((w) => lower.includes(` ${w} `) || lower.includes(` ${w},`));
}

/** True when a heading marks an out-of-scope section. Pure. */
function isOutOfScopeHeading(heading: string): boolean {
  const lower = heading.toLowerCase();
  return OUT_OF_SCOPE_MARKERS.some((m) => lower.includes(m));
}

/** Drop a leading stop-word token ("The Goal Ledger" → "Goal Ledger") so it doesn't glue on. Pure. */
function dropLeadingStopword(phrase: string): string {
  const parts = phrase.split(/\s+/);
  const first = parts[0];
  if (parts.length > 1 && first && ENTITY_STOPWORDS.has(first)) return parts.slice(1).join(" ");
  return phrase;
}

/** Pull capitalized multi-word noun phrases (e.g. "Operator Profile") from a line. Pure. */
function capitalizedPhrases(text: string): string[] {
  const matches = text.match(/\b([A-Z][\w-]+(?:\s+[A-Z][\w-]+)*)\b/g) ?? [];
  return matches
    .map((m) => dropLeadingStopword(m.trim()))
    .filter((m) => m.length > 1)
    .filter((m) => !(ENTITY_STOPWORDS.has(m) && !m.includes(" ")));
}

/** Add to a frequency-ranked, insertion-stable set. Pure-ish (mutates the passed map). */
function tally(counts: Map<string, number>, key: string): void {
  if (!key) return;
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

/** Rank tallied entities by frequency (desc), ties broken by first-seen order, then cap. Pure. */
function rankEntities(counts: Map<string, number>): string[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([key]) => key)
    .slice(0, MAX_ENTITIES);
}

/** Running accumulator while scanning a doc line-by-line. */
type ScanState = {
  counts: Map<string, number>;
  scope: string[];
  constraints: string[];
  outOfScope: boolean;
};

/** Record a constraint if the line carries an obligation and there's room. Pure-ish. */
function pushConstraint(s: ScanState, line: string): void {
  if (isConstraintLine(line) && s.constraints.length < MAX_CONSTRAINTS) s.constraints.push(line);
}

/** Apply one heading line: flips the out-of-scope flag, tallies entities, may record a constraint. */
function scanHeading(s: ScanState, heading: string): void {
  s.outOfScope = isOutOfScopeHeading(heading);
  tally(s.counts, heading);
  for (const phrase of capitalizedPhrases(heading)) tally(s.counts, phrase);
  pushConstraint(s, heading);
}

/** Apply one body (non-heading) line: tallies entities, may record scope, may record a constraint. */
function scanBody(s: ScanState, line: string): void {
  for (const phrase of capitalizedPhrases(line)) tally(s.counts, phrase);
  const bullet = bulletText(line);
  if (bullet !== null && !s.outOfScope && s.scope.length < MAX_SCOPE) s.scope.push(bullet);
  pushConstraint(s, bullet ?? line);
}

/**
 * Extract scope, entities, and constraints from a PRD-like source doc.
 *
 * Heuristics (all pure, no I/O):
 *  - Entities: every heading's text + capitalized noun phrases across the doc,
 *    ranked by how often they recur (a name repeated across sections matters more).
 *  - Scope: bullet/numbered items under in-scope sections; bullets under an
 *    out-of-scope/non-goal heading are excluded (they're explicitly NOT the task).
 *  - Constraints: any line (heading, bullet, or prose) carrying an obligation word
 *    (must/should/never/required/only/…).
 *
 * Empty or content-free input returns a safe empty result (no throws).
 */
export function extractScope(sourceText: string): ExtractedScope {
  const s: ScanState = { counts: new Map(), scope: [], constraints: [], outOfScope: false };

  for (const raw of lines(sourceText)) {
    const line = plainText(raw);
    const heading = headingText(line);
    if (heading !== null) scanHeading(s, heading);
    else scanBody(s, line);
  }

  return { entities: rankEntities(s.counts), scope: s.scope, constraints: s.constraints };
}

/** Render one section of the brief, or nothing when the list is empty. Pure. */
function section(title: string, items: string[]): string[] {
  if (items.length === 0) return [];
  return [`## ${title}`, ...items.map((i) => `- ${i}`), ""];
}

/**
 * Render a grounding brief the agent references BEFORE its first tool call.
 *
 * `source` names where the grounding came from (a path or a doc title). The brief
 * leads with that provenance, then the extracted entities/scope/constraints, then a
 * standing instruction to act only within the named scope.
 */
export function buildLaunchpadBrief(source: string, extracted: ExtractedScope): string {
  const { entities, scope, constraints } = extracted;
  const grounded = entities.length + scope.length + constraints.length > 0;

  const out: string[] = [`# Launchpad brief — grounded in ${source}`, ""];

  if (!grounded) {
    out.push(
      "No scope, entities, or constraints could be extracted from this source.",
      "Do NOT launch from thin air: ask for a real PRD / ticket / file before acting.",
    );
    return out.join("\n");
  }

  out.push(
    ...section("Entities", entities),
    ...section("Scope", scope),
    ...section("Constraints", constraints),
    "Reference this scope before the first tool call. Act only on the named scope;",
    "anything outside it is out of scope — surface it, do not silently expand.",
  );
  return out.join("\n").trimEnd();
}

/**
 * Seed a task from a named source doc through an injected `readFile`.
 *
 * Returns the extraction as a value. A blank path, a read failure, or an empty
 * doc all come back as `{ok:false}` — this never throws across the boundary.
 */
export async function seedFromSource(path: string, readFile: ReadFile): Promise<SeedResult | SeedError> {
  const target = path.trim();
  if (!target) return { ok: false, error: "no source path given — name a PRD / ticket / file to ground on" };

  let source: string;
  try {
    source = await readFile(target);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `could not read source "${target}": ${detail}` };
  }

  if (source.trim().length === 0) {
    return { ok: false, error: `source "${target}" is empty — nothing to ground the task in` };
  }

  return { ok: true, path: target, source, extracted: extractScope(source) };
}
