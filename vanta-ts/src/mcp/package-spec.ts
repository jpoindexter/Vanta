// Package-runner launch parsing for MCP servers.
//
// An MCP stdio server is often launched as `npx -y some-mcp`, `uvx some-mcp==1.2`,
// `pnpm dlx`, `bunx`, `pipx run` and friends. Those commands download and run code
// the operator never reviewed, so Vanta wants the PACKAGE (not just the command
// line) in front of the guard. This module turns a `command + args` pair into the
// registry packages it would fetch. Pure: no I/O, no network.
//
// Non-registry sources (git URLs, tarballs, local paths) are not packages a name
// list can judge, so they parse to nothing.

export type PackageEcosystem = "npm" | "pypi";

export type PackageSpec = {
  ecosystem: PackageEcosystem;
  /** Normalized name: npm lowercased, pypi lowercased with runs of `-_.` folded to `-`. */
  name: string;
  /** The version or tag written in the launch, when there is one. */
  version?: string;
  /** True only for an exact version (`1.2.3`, `==1.2.3`). Tags, ranges and nothing are unpinned. */
  pinned: boolean;
  /** The runner as the operator wrote it, e.g. `npx`, `uvx`, `pnpm dlx`. */
  runner: string;
  /** The spec exactly as written in the launch, e.g. `@scope/pkg@1.0.0`. */
  raw: string;
};

type Runner = {
  ecosystem: PackageEcosystem;
  /** Flags that consume the next argument and do NOT name a package. */
  valueFlags: ReadonlySet<string>;
  /** Flags whose value names the package to run (the positional is then a command). */
  primaryFlags: ReadonlySet<string>;
  /** Flags whose value names an extra package installed alongside. */
  extraFlags: ReadonlySet<string>;
};

const NPM_RUNNER: Runner = {
  ecosystem: "npm",
  valueFlags: new Set(["--registry", "--cache", "--userconfig", "--prefix", "-w", "--workspace", "-c", "--call"]),
  primaryFlags: new Set(["-p", "--package"]),
  extraFlags: new Set(),
};

const UVX_RUNNER: Runner = {
  ecosystem: "pypi",
  valueFlags: new Set([
    "-p", "--python", "-i", "--index", "--index-url", "--extra-index-url", "--default-index", "-f", "--find-links",
    "-c", "--constraints", "--overrides", "--env-file", "--directory", "--project", "--config-file", "--cache-dir",
    "--resolution", "--prerelease", "--index-strategy", "--keyring-provider", "--exclude-newer", "--with-requirements",
    "--with-editable", "-P", "--upgrade-package", "--reinstall-package", "--refresh-package", "--link-mode",
  ]),
  primaryFlags: new Set(["--from"]),
  extraFlags: new Set(["--with"]),
};

const PIPX_RUNNER: Runner = {
  ecosystem: "pypi",
  valueFlags: new Set(["--python", "--pip-args", "--index-url", "--path"]),
  primaryFlags: new Set(["--spec"]),
  extraFlags: new Set(),
};

type RunnerRule = { runner: Runner; label: string; prefix: readonly string[] };

const RULES: Record<string, RunnerRule[]> = {
  npx: [{ runner: NPM_RUNNER, label: "npx", prefix: [] }],
  bunx: [{ runner: NPM_RUNNER, label: "bunx", prefix: [] }],
  pnpx: [{ runner: NPM_RUNNER, label: "pnpx", prefix: [] }],
  uvx: [{ runner: UVX_RUNNER, label: "uvx", prefix: [] }],
  pnpm: [{ runner: NPM_RUNNER, label: "pnpm dlx", prefix: ["dlx"] }],
  yarn: [{ runner: NPM_RUNNER, label: "yarn dlx", prefix: ["dlx"] }],
  bun: [{ runner: NPM_RUNNER, label: "bun x", prefix: ["x"] }],
  npm: [
    { runner: NPM_RUNNER, label: "npm exec", prefix: ["exec"] },
    { runner: NPM_RUNNER, label: "npm x", prefix: ["x"] },
  ],
  pipx: [{ runner: PIPX_RUNNER, label: "pipx run", prefix: ["run"] }],
  uv: [{ runner: UVX_RUNNER, label: "uv tool run", prefix: ["tool", "run"] }],
};

/** `/usr/local/bin/npx`, `npx.cmd`, `NPX.EXE` all name the runner `npx`. */
function runnerBase(command: string): string {
  const base = command.split(/[\\/]/).pop() ?? command;
  return base.toLowerCase().replace(/\.(cmd|exe|ps1|bat)$/, "");
}

function matchRule(command: string, args: readonly string[]): { rule: RunnerRule; rest: string[] } | null {
  for (const rule of RULES[runnerBase(command)] ?? []) {
    const head = args.slice(0, rule.prefix.length);
    if (rule.prefix.every((word, i) => head[i] === word)) return { rule, rest: args.slice(rule.prefix.length) };
  }
  return null;
}

function splitFlag(arg: string): [string, string | undefined] {
  const eq = arg.indexOf("=");
  return arg.startsWith("--") && eq > 0 ? [arg.slice(0, eq), arg.slice(eq + 1)] : [arg, undefined];
}

type Collected = { primary: string[]; extra: string[]; positional?: string };

function collectSpecs(args: readonly string[], runner: Runner): Collected {
  const out: Collected = { primary: [], extra: [] };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--") {
      out.positional = args[i + 1];
      break;
    }
    if (!arg.startsWith("-")) {
      out.positional = arg;
      break;
    }
    const [flag, inline] = splitFlag(arg);
    const names = flagTarget(out, runner, flag);
    const value = inline ?? (names || runner.valueFlags.has(flag) ? args[++i] : undefined);
    if (names && value !== undefined) names.push(value);
  }
  return out;
}

/** Which collected list a flag's value belongs to, or null when it names no package. */
function flagTarget(out: Collected, runner: Runner, flag: string): string[] | null {
  if (runner.primaryFlags.has(flag)) return out.primary;
  return runner.extraFlags.has(flag) ? out.extra : null;
}

const NON_REGISTRY = /^(?:[./~]|[a-z][a-z0-9+.-]*:|.*\.(?:tgz|tar\.gz|whl|zip)$)/i;
const NPM_NAME = /^(?:@[a-z0-9~-][a-z0-9._~-]*\/)?[a-z0-9~-][a-z0-9._~-]*$/;
const PYPI_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const NPM_EXACT = /^v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.+-]+)?$/;
const PYPI_EXACT = /^\d[0-9A-Za-z.+!_-]*$/;

function normalizeNpmName(name: string): string {
  return name.toLowerCase();
}

/** PEP 503 normalization: case-insensitive, runs of `-`, `_`, `.` are one separator. */
export function normalizePypiName(name: string): string {
  return name.toLowerCase().replace(/[-_.]+/g, "-");
}

function parseNpm(raw: string): Pick<PackageSpec, "name" | "version" | "pinned"> | null {
  const at = raw.lastIndexOf("@");
  const name = at > 0 ? raw.slice(0, at) : raw;
  const version = at > 0 ? raw.slice(at + 1) : undefined;
  if (!NPM_NAME.test(name.toLowerCase())) return null;
  return { name: normalizeNpmName(name), version: version || undefined, pinned: !!version && NPM_EXACT.test(version) };
}

function parsePypi(raw: string): Pick<PackageSpec, "name" | "version" | "pinned"> | null {
  const m = /^([A-Za-z0-9][A-Za-z0-9._-]*)(?:\[[^\]]*\])?\s*(.*)$/.exec(raw.trim());
  if (!m || !PYPI_NAME.test(m[1]!)) return null;
  const rest = (m[2] ?? "").trim();
  const exact = /^(?:==|@)\s*(.+)$/.exec(rest)?.[1]?.trim();
  const pinned = !!exact && PYPI_EXACT.test(exact) && !exact.endsWith("*");
  return { name: normalizePypiName(m[1]!), version: exact || undefined, pinned };
}

function toSpec(raw: string, ecosystem: PackageEcosystem, runner: string): PackageSpec | null {
  const trimmed = raw.trim();
  if (!trimmed || NON_REGISTRY.test(trimmed)) return null;
  const parsed = ecosystem === "npm" ? parseNpm(trimmed) : parsePypi(trimmed);
  return parsed ? { ecosystem, runner, raw: trimmed, ...parsed } : null;
}

/**
 * The registry packages a launch would fetch and run. A non-package-runner command
 * (`node server.js`, `python -m x`, a bare binary) yields `[]`.
 */
export function parsePackageLaunch(command: string, args: readonly string[]): PackageSpec[] {
  const matched = matchRule(command, args);
  if (!matched) return [];
  const { rule, rest } = matched;
  const found = collectSpecs(rest, rule.runner);
  const main = found.primary.length > 0 ? found.primary : found.positional ? [found.positional] : [];
  return [...main, ...found.extra]
    .map((raw) => toSpec(raw, rule.runner.ecosystem, rule.label))
    .filter((spec): spec is PackageSpec => spec !== null);
}

/**
 * One operator-facing sentence per unpinned package in a launch, or null when every
 * package is pinned (or the launch is not a package-runner launch). Shown on the
 * approval prompt so the owner sees that the code can change under a standing approval.
 */
export function unpinnedNote(command: string, args: readonly string[]): string | null {
  const unpinned = parsePackageLaunch(command, args).filter((spec) => !spec.pinned);
  if (unpinned.length === 0) return null;
  const names = unpinned.map((spec) => `${spec.name}${spec.version ? `@${spec.version}` : " (no version)"}`).join(", ");
  return `Unpinned package: ${names}. ${unpinned[0]!.runner} fetches whatever is newest each launch, so this approval does not fix the code that runs. Pin an exact version to review it once.`;
}
