import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { serializeSkill } from "../skills/frontmatter.js";
import type { Skill } from "../skills/types.js";
import type { SlashHandler } from "./types.js";

/** The verification gate a detected command runs. Drives the generated skill name `verify-<kind>`. */
export type VerifierKind = "test" | "build" | "lint" | "typecheck";

/** One detected, runnable project gate: a kind, a human label, and the exact command to run. */
export type Verifier = { name: string; command: string; kind: VerifierKind };

/** Raw project config text the detector reads. All optional — a project may have any subset. */
export type ProjectFiles = {
  packageJson?: string;
  cargoToml?: string;
  makefile?: string;
};

/** package.json script names mapped to the verifier kind they satisfy (first match wins per kind). */
const SCRIPT_KINDS: ReadonlyArray<{ script: string; kind: VerifierKind }> = [
  { script: "test", kind: "test" },
  { script: "build", kind: "build" },
  { script: "lint", kind: "lint" },
  { script: "typecheck", kind: "typecheck" },
];

/** A generated SKILL.md slug is derived from the kind; this is the single source for skill names. */
function skillNameFor(kind: VerifierKind): string {
  return `verify-${kind}`;
}

/** Parse package.json `scripts` into verifiers, tolerant of garbage input (returns [] on parse failure). */
function fromPackageJson(text: string): Verifier[] {
  let scripts: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(text);
    const candidate = (parsed as { scripts?: unknown } | null)?.scripts;
    if (candidate && typeof candidate === "object") scripts = candidate as Record<string, unknown>;
  } catch {
    return []; // not valid JSON — skip, don't synthesize a command
  }
  const out: Verifier[] = [];
  for (const { script, kind } of SCRIPT_KINDS) {
    if (typeof scripts[script] === "string" && scripts[script]) {
      out.push({ name: skillNameFor(kind), command: `npm run ${script}`, kind });
    }
  }
  return out;
}

/** A Cargo.toml means a Rust crate — `cargo test` and `cargo build` are the standard gates. */
function fromCargoToml(text: string): Verifier[] {
  if (!text.trim()) return [];
  return [
    { name: skillNameFor("test"), command: "cargo test", kind: "test" },
    { name: skillNameFor("build"), command: "cargo build", kind: "build" },
  ];
}

/** Matches a Makefile target declaration line (`target:`) for a specific target name. */
function hasMakeTarget(text: string, target: string): boolean {
  const re = new RegExp(`^${target}\\s*:`, "m");
  return re.test(text);
}

/** Makefile `test`/`build` targets become `make test`/`make build` verifiers. */
function fromMakefile(text: string): Verifier[] {
  const out: Verifier[] = [];
  if (hasMakeTarget(text, "test")) out.push({ name: skillNameFor("test"), command: "make test", kind: "test" });
  if (hasMakeTarget(text, "build")) out.push({ name: skillNameFor("build"), command: "make build", kind: "build" });
  return out;
}

/**
 * Detect a project's verifier commands from its own config text. SECURITY: only
 * commands derived from the project's package.json scripts, a Cargo.toml, or a
 * Makefile are emitted — never a synthesized arbitrary shell command. Tolerant of
 * malformed input (a garbage package.json is skipped). De-duplicated by kind
 * (package.json wins over Cargo/Makefile for the same kind).
 */
export function detectVerifierCommands(projectFiles: ProjectFiles): Verifier[] {
  const candidates: Verifier[] = [
    ...(projectFiles.packageJson ? fromPackageJson(projectFiles.packageJson) : []),
    ...(projectFiles.cargoToml ? fromCargoToml(projectFiles.cargoToml) : []),
    ...(projectFiles.makefile ? fromMakefile(projectFiles.makefile) : []),
  ];
  const seen = new Set<VerifierKind>();
  const out: Verifier[] = [];
  for (const v of candidates) {
    if (seen.has(v.kind)) continue;
    seen.add(v.kind);
    out.push(v);
  }
  return out;
}

/**
 * Build the SKILL.md content for one verifier: `verify-<kind>` frontmatter plus a
 * body that instructs the agent to run the project's own command and treat exit 0
 * as the only pass. The body references the exact detected command — nothing else.
 */
export function buildVerifierSkill(verifier: Verifier, now = new Date().toISOString()): string {
  const skill: Skill = {
    meta: {
      name: verifier.name,
      description: `Verify the project's ${verifier.kind} gate by running \`${verifier.command}\`.`,
      created: now,
      updated: now,
      tags: ["verifier", verifier.kind],
    },
    body: [
      `# ${verifier.name}`,
      "",
      `Run the project's ${verifier.kind} gate to verify your work against the real command.`,
      "",
      "## Steps",
      "",
      `1. Run: \`${verifier.command}\``,
      `2. The skill **passes only if the command exits 0**. A non-zero exit is a failure.`,
      "3. On failure, read the output, fix the cause, and re-run until it exits 0.",
    ].join("\n"),
  };
  return serializeSkill(skill);
}

/** Build one SKILL.md string per detected command, paired with its `verify-<kind>` name. */
export function verifierSkills(commands: Verifier[], now?: string): Array<{ name: string; content: string }> {
  return commands.map((v) => ({ name: v.name, content: buildVerifierSkill(v, now) }));
}

/** Generic fallback note when a project exposes no detectable build/test/lint/typecheck command. */
const GENERIC_NOTE = [
  "  no build/test/lint/typecheck command detected in package.json, Cargo.toml, or a Makefile.",
  "  generic verifier: identify this project's own gate, run it, and treat a 0 exit as the only pass.",
].join("\n");

/** Reads a file's text or undefined if absent — injectable so the handler stays pure-testable. */
export type FileReader = (path: string) => Promise<string | undefined>;

const fsReader: FileReader = (path) => readFile(path, "utf8").then((t) => t, () => undefined);

/** Read the three project config files (best-effort) into a {@link ProjectFiles}. */
async function readProjectFiles(root: string, read: FileReader): Promise<ProjectFiles> {
  const [packageJson, cargoToml, makefile] = await Promise.all([
    read(join(root, "package.json")),
    read(join(root, "Cargo.toml")),
    read(join(root, "Makefile")),
  ]);
  return { packageJson, cargoToml, makefile };
}

/** Render the summary of verifiers `/init-verifiers` would create (the write is delegated/named below). */
function formatSummary(commands: Verifier[]): string {
  if (!commands.length) return GENERIC_NOTE;
  const rows = commands.map((v) => `  · ${v.name.padEnd(18)}${v.command}`);
  return [
    `  ${commands.length} verifier skill(s) ready to write (run \`write_skill\` to save each):`,
    ...rows,
  ].join("\n");
}

/**
 * `/init-verifiers` — detect the project's build/test/lint/typecheck commands and
 * report the verifier skills it would create (one `verify-<kind>` SKILL.md per
 * command). The actual SKILL.md write is delegated: the agent calls the
 * `write_skill` tool (named here), so this handler stays read-only.
 */
export const initVerifiers: SlashHandler = async (_arg, ctx) => {
  return runInitVerifiers(dirname(ctx.dataDir), fsReader);
};

/** Pure-testable core of {@link initVerifiers}: read → detect → summarize. */
export async function runInitVerifiers(root: string, read: FileReader): Promise<{ output: string }> {
  const files = await readProjectFiles(root, read);
  const commands = detectVerifierCommands(files);
  return { output: formatSummary(commands) };
}
