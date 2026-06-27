/**
 * VANTA-LAUNCHPAD — ground a task in a real source doc before acting.
 *
 * Before Vanta generates or reaches for a tool, it should launch FROM something:
 * a PRD/ROADMAP, a ticket, a local file. Without one it launches from thin air.
 * This module is the grounding surface over the pure extraction engine:
 *
 *  - `extractScope(sourceText)` (re-exported from `launchpad-extract.ts`) reads a
 *    PRD-like doc into a structured {entities, scope, constraints}.
 *  - `buildLaunchpadBrief(source, extracted)` renders a grounding brief string the
 *    agent references in its plan before the first tool call.
 *  - `seedFromSource(path, readFile)` reads a named doc through an INJECTED fs and
 *    returns the extraction as a value (errors-as-values; never throws).
 *
 * Everything here is pure except `seedFromSource`, whose only side effect (the
 * read) is injected so the whole surface is unit-testable without the filesystem.
 */

import { extractScope, type ExtractedScope } from "./launchpad-extract.js";

export { extractScope, type ExtractedScope } from "./launchpad-extract.js";

/** A read failure surfaced as a value (errors-as-values — `seedFromSource` never throws). */
export type SeedError = { ok: false; error: string };
/** A successful seed: the source path + text it grounded on, and the extraction. */
export type SeedResult = { ok: true; path: string; source: string; extracted: ExtractedScope };

/** Injected file reader so `seedFromSource` stays testable without touching disk. */
export type ReadFile = (path: string) => Promise<string>;

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
