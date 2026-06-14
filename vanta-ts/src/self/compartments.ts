export type Compartment = "brainstem" | "skeleton" | "reflexes" | "limbs" | "memory";

export type CompartmentInfo = {
  compartment: Compartment;
  maxAutonomy: "none" | "review" | "auto";
  why: string;
};

const BRAINSTEM_PATTERNS = [
  /^src[\\/][^/]+\.rs$/i,
  /^cargo\.(toml|lock)$/i,
  /^manifesto\.md$/i,
];

const SKELETON_PREFIX = "vanta-ts/src/factory/";

const REFLEXES_PATTERNS = [
  /^vanta-ts\/src\/agent\.ts$/i,
  /^vanta-ts\/src\/agent\//i,
  /^vanta-ts\/src\/prompt\.ts$/i,
];

const MEMORY_PATTERNS = [
  /^vanta-ts\/src\/world\//i,
  /\/money\//i,
  /\/radar\//i,
  /\/team\//i,
  /\/brain/i,
  /^\.vanta\//i,
];

function isBrainstem(p: string): boolean {
  return BRAINSTEM_PATTERNS.some((re) => re.test(p));
}

function isSkeleton(p: string): boolean {
  return p.startsWith(SKELETON_PREFIX);
}

function isReflexes(p: string): boolean {
  return REFLEXES_PATTERNS.some((re) => re.test(p));
}

function isMemory(p: string): boolean {
  return MEMORY_PATTERNS.some((re) => re.test(p));
}

/** Classify a repo-relative path into a body compartment + its max autonomy. Pure. */
export function classifyPath(relPath: string): CompartmentInfo {
  const p = relPath.replace(/\\/g, "/");
  if (isBrainstem(p)) {
    return { compartment: "brainstem", maxAutonomy: "none", why: "safety kernel / manifesto — never self-edit" };
  }
  if (isSkeleton(p)) {
    return { compartment: "skeleton", maxAutonomy: "none", why: "factory guardrails — never self-edit" };
  }
  if (isReflexes(p)) {
    return { compartment: "reflexes", maxAutonomy: "review", why: "core loop/prompt — edit with review" };
  }
  if (isMemory(p)) {
    return { compartment: "memory", maxAutonomy: "auto", why: "data stores — safe to evolve" };
  }
  return { compartment: "limbs", maxAutonomy: "auto", why: "feature code — build/replace freely" };
}

/** The compartment model as a list (for the /compartments view). */
export function compartmentMap(): { compartment: Compartment; maxAutonomy: string; scope: string }[] {
  return [
    { compartment: "brainstem", maxAutonomy: "none",   scope: "src/*.rs, Cargo.toml/lock, manifesto.md" },
    { compartment: "skeleton",  maxAutonomy: "none",   scope: "vanta-ts/src/factory/" },
    { compartment: "reflexes",  maxAutonomy: "review", scope: "vanta-ts/src/agent.ts, src/agent/, src/prompt.ts" },
    { compartment: "memory",    maxAutonomy: "auto",   scope: "src/world/, /money/, /radar/, /team/, /brain, .vanta/" },
    { compartment: "limbs",     maxAutonomy: "auto",   scope: "everything else — tools, ui, repl, etc." },
  ];
}
