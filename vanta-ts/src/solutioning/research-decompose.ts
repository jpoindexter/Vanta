/**
 * VANTA-RESEARCH-DECOMPOSE — pure query decomposition + transparent synthesis.
 *
 * `decomposeObjective` fans one research objective into labeled, independent
 * sub-queries (each {dimension, query}); `synthesize` folds the parallel
 * sub-query results back into one report that shows, per dimension, WHICH tools
 * ran and what each found. Both pure — no subagents, no LLM, no I/O — so the
 * decomposition and synthesis are unit-testable on their own.
 */

/** A labeled, independent slice of a research objective. */
export type SubQuery = {
  /** The research dimension this sub-query covers (e.g. "current state"). */
  dimension: string;
  /** The concrete question handed to the parallel runner. */
  query: string;
};

/** The result of running one sub-query, as collected from the runner. */
export type SubQueryResult = {
  dimension: string;
  query: string;
  /** Tool names the runner reported using for this dimension. */
  toolsUsed: string[];
  /** What the sub-query found (the runner's verified output text). */
  findings: string;
};

/** Hard cap on fan-out so an objective can never spawn unbounded workers. */
export const MAX_SUB_QUERIES = 6;

/**
 * The fixed research dimensions, ordered. Decomposition assigns the objective
 * to each as an independent angle — these are the parallelizable axes a
 * research goal almost always wants covered.
 */
const DIMENSIONS: ReadonlyArray<{ dimension: string; lens: string }> = [
  { dimension: "current state", lens: "What is the current state of" },
  { dimension: "prior work", lens: "What prior work, approaches, or solutions exist for" },
  { dimension: "constraints", lens: "What constraints, risks, or trade-offs apply to" },
  { dimension: "evidence", lens: "What concrete evidence, data, or benchmarks bear on" },
  { dimension: "open questions", lens: "What remains unknown or contested about" },
  { dimension: "recommendation", lens: "What does the evidence recommend doing about" },
];

function normalizeObjective(objective: string): string {
  return objective.trim().replace(/\s+/g, " ");
}

/**
 * Decompose a research objective into labeled, independent sub-queries.
 *
 * Returns at least 2 sub-queries (each a distinct {dimension, query}) and never
 * more than `count` (clamped to [2, MAX_SUB_QUERIES]). Each sub-query is a
 * self-contained angle on the same objective, so they can run in parallel with
 * no shared state.
 */
export function decomposeObjective(objective: string, count = 4): SubQuery[] {
  const obj = normalizeObjective(objective);
  if (obj.length === 0) return [];
  const clamped = Math.max(2, Math.min(count, MAX_SUB_QUERIES));
  return DIMENSIONS.slice(0, clamped).map(({ dimension, lens }) => ({
    dimension,
    query: `${lens}: ${obj}?`,
  }));
}

function formatTools(toolsUsed: string[]): string {
  const tools = toolsUsed.filter((t) => t.trim().length > 0);
  return tools.length > 0 ? tools.join(", ") : "(none reported)";
}

function formatFindings(findings: string): string {
  const text = findings.trim();
  return text.length > 0 ? text : "(no findings)";
}

function formatResult(result: SubQueryResult): string {
  return [
    `## ${result.dimension}`,
    `query: ${result.query.trim()}`,
    `tools: ${formatTools(result.toolsUsed)}`,
    `findings: ${formatFindings(result.findings)}`,
  ].join("\n");
}

function collectAllTools(results: SubQueryResult[]): string[] {
  const seen = new Set<string>();
  for (const r of results) {
    for (const t of r.toolsUsed) {
      const name = t.trim();
      if (name.length > 0) seen.add(name);
    }
  }
  return [...seen];
}

/**
 * Synthesize parallel sub-query results into one transparent report.
 *
 * The report shows, per dimension: the sub-query that ran, which tools it used,
 * and what it found — so the reader can audit every claim back to a tool. A
 * footer lists the union of tools that ran across all dimensions.
 */
export function synthesize(results: SubQueryResult[]): string {
  if (results.length === 0) return "No research dimensions ran.";
  const body = results.map(formatResult).join("\n\n");
  const allTools = collectAllTools(results);
  const footer = `tools used across research: ${formatTools(allTools)}`;
  return `# Research synthesis (${results.length} dimensions)\n\n${body}\n\n${footer}`;
}
