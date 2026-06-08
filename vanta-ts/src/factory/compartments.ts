// O11 — compartmentalized self-repair. The codebase is classified into
// self-modification tiers, like a body: each tier caps how far the factory may
// proceed autonomously after a clean verify (ties into the O10 autonomy ladder).
//
//   skeleton   kernel + safety policy + factory + manifesto — NEVER autonomous
//   brainstem  the agent loop and its lifeline — implement + human review only
//   limbs      tools and other improvable app code — freely improvable (to merge)
//   reflexes   skills — self-evolving, low-risk markdown/skill data
//   memory     brain + per-goal memory — self-knowledge, autonomous
//
// The kernel's `is_protected_path` already BLOCKS skeleton/brainstem writes at
// every level (the verifier mirrors it). This module formalizes the softer caps
// the kernel can't express — e.g. "a brainstem fix may implement but never
// auto-commit." It is pure; `run.ts` clamps the requested autonomy level to the
// most restrictive compartment among the files a slice actually touched.

export type Compartment = "skeleton" | "brainstem" | "limbs" | "reflexes" | "memory";

/** Agent-loop files whose change alters how Vanta decides — review required. */
const BRAINSTEM = [
  "vanta-ts/src/agent.ts",
  "vanta-ts/src/providers/",
  "vanta-ts/src/prompt.ts",
  "vanta-ts/src/context.ts",
  "vanta-ts/src/session.ts",
  "vanta-ts/src/safety-client.ts",
  "vanta-ts/src/kernel-launcher.ts",
  "vanta-ts/src/scope.ts",
];

function isSkeleton(s: string): boolean {
  return (
    (s.startsWith("src/") && (s.endsWith(".rs") || s.endsWith(".toml") || s.endsWith(".lock"))) ||
    s === "cargo.toml" ||
    s === "cargo.lock" ||
    (s.startsWith("vanta-ts/src/factory/") && s.endsWith(".ts")) ||
    s === "manifesto.md"
  );
}

/** Which self-modification tier a repo file belongs to. */
export function classifyCompartment(file: string): Compartment {
  const s = file.toLowerCase();
  if (isSkeleton(s)) return "skeleton";
  if (s.startsWith("vanta-ts/src/brain/") || s.startsWith("vanta-ts/src/memory/")) return "memory";
  if (s.startsWith("vanta-ts/src/skills/") || s.startsWith("skills-library/")) return "reflexes";
  if (BRAINSTEM.some((p) => (p.endsWith("/") ? s.startsWith(p) : s === p))) return "brainstem";
  return "limbs";
}

/** Highest autonomy level (0–5) a compartment permits after a clean verify. */
export function compartmentMaxAutonomy(c: Compartment): number {
  switch (c) {
    case "skeleton":
      return 0; // never autonomous (also hard-blocked by the kernel)
    case "brainstem":
      return 2; // implement + verify, then STOP for human review
    case "limbs":
    case "reflexes":
    case "memory":
      return 5; // freely improvable — eligible for the full ladder incl. merge
  }
}

/**
 * The autonomy cap for a slice = the most restrictive compartment among the
 * files it touched. An empty slice is unconstrained (L5).
 */
export function autonomyCapForFiles(files: string[]): { compartment: Compartment; maxLevel: number } {
  let cap: { compartment: Compartment; maxLevel: number } = { compartment: "limbs", maxLevel: 5 };
  for (const f of files) {
    const c = classifyCompartment(f);
    const lvl = compartmentMaxAutonomy(c);
    if (lvl < cap.maxLevel) cap = { compartment: c, maxLevel: lvl };
  }
  return cap;
}
