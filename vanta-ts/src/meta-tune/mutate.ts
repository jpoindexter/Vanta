const CANDIDATES = [
  "Before claiming completion, cite the exact verification signal and what it does not prove.",
  "When progress stalls, shrink the next attempt to one reversible change plus one check.",
  "Prefer boundary-preserving composition over editing protected or high-blast-radius modules.",
  "When eval evidence conflicts with intuition, trust the eval and record the surprise.",
  "Keep instruction changes general; do not bake task-specific answers into the harness.",
];

export function mutationFor(iter: number): string {
  return CANDIDATES[(iter - 1) % CANDIDATES.length] ?? CANDIDATES[0]!;
}

export function mutateProgram(base: string, iter: number): { program: string; summary: string } {
  const line = mutationFor(iter);
  if (base.includes(line)) return { program: base, summary: `already had: ${line}` };
  return { program: `${base.trimEnd()}\n- ${line}\n`, summary: line };
}
