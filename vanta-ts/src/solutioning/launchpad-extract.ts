/**
 * VANTA-LAUNCHPAD — the pure extraction engine.
 *
 * Reads a PRD-like doc with heuristics (headings, capitalized noun phrases,
 * "must/should" constraints, bullet items) into a structured
 * {entities, scope, constraints}. Everything here is pure, no I/O. Extracted
 * from launchpad.ts (size gate); `launchpad.ts` re-exports `extractScope` +
 * `ExtractedScope` so importers stay unchanged.
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
