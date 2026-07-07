import type { WorldEntity } from "./store.js";

// WORLD-MODEL (first slice) — a stored map of every repo under _active/: its
// stack (detected from marker files) and last-known git state. Pure detection +
// formatting + an injected scan (fs listing + git state supplied by the caller),
// so the whole thing is testable with no filesystem. Each repo becomes a world
// `entity` (type "repo"), reusing the existing world store + `/world` query.

// Marker file → stack label. First-match order doesn't matter (a repo can hit
// several — Vanta itself is Rust + TypeScript). Checked against a dir's top-level names.
const STACK_MARKERS: ReadonlyArray<[string, string]> = [
  ["Cargo.toml", "Rust"],
  ["go.mod", "Go"],
  ["pyproject.toml", "Python"],
  ["requirements.txt", "Python"],
  ["Gemfile", "Ruby"],
  ["composer.json", "PHP"],
  ["pom.xml", "JVM"],
  ["build.gradle", "JVM"],
  ["deno.json", "Deno"],
  ["tauri.conf.json", "Tauri"],
  ["package.json", "Node"],
  ["tsconfig.json", "TypeScript"],
];

/** Detect the stack(s) of a repo from its top-level file names. Pure.
 * "Node" is dropped when "TypeScript" is present (the more specific label wins). */
export function detectStack(topLevelFiles: string[]): string[] {
  const names = new Set(topLevelFiles);
  const hits = STACK_MARKERS.filter(([f]) => names.has(f)).map(([, label]) => label);
  const uniq = [...new Set(hits)];
  return uniq.includes("TypeScript") ? uniq.filter((s) => s !== "Node") : uniq;
}

export type RepoScan = {
  name: string;
  /** Top-level file names of the repo dir. */
  files: string[];
  /** Current git branch, or null when not a git repo / unknown. */
  branch: string | null;
  /** Last commit subject (short), or null. */
  lastCommit: string | null;
};

/** Build a stored world entity for a scanned repo. Pure. */
export function repoEntity(scan: RepoScan, now: string): WorldEntity {
  const stack = detectStack(scan.files);
  const state = scan.branch ? `${scan.branch}${scan.lastCommit ? `: ${scan.lastCommit}` : ""}` : "no git state";
  return {
    kind: "entity",
    id: `repo:${scan.name}`,
    type: "repo",
    name: scan.name,
    note: `${stack.length ? stack.join(" + ") : "unknown stack"} — ${state}`,
    ts: now,
  };
}

export type ScanDeps = {
  /** Repo names under the base dir (directories only). */
  listRepos: () => Promise<string[]>;
  /** Top-level file names of a repo. */
  listFiles: (repo: string) => Promise<string[]>;
  /** Git branch + last-commit subject for a repo (nulls when unavailable). */
  gitState: (repo: string) => Promise<{ branch: string | null; lastCommit: string | null }>;
};

/** Scan every repo → world entities. Injected I/O keeps it testable. */
export async function scanSystemMap(deps: ScanDeps, now: string): Promise<WorldEntity[]> {
  const repos = await deps.listRepos();
  return Promise.all(
    repos.map(async (name) => {
      const [files, git] = await Promise.all([
        deps.listFiles(name).catch(() => [] as string[]),
        deps.gitState(name).catch(() => ({ branch: null, lastCommit: null })),
      ]);
      return repoEntity({ name, files, branch: git.branch, lastCommit: git.lastCommit }, now);
    }),
  );
}

/** Render the system map for display. Pure. */
export function formatSystemMap(entities: WorldEntity[]): string {
  if (entities.length === 0) return "No repos found under the projects dir (set VANTA_PROJECTS_DIR).";
  const rows = entities.map((e) => `  ${e.name.padEnd(18)} ${e.note ?? ""}`);
  return `System map — ${entities.length} repo(s):\n${rows.join("\n")}`;
}
