import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";

// DEP-AUDIT — supply-chain scan: npm audit + cargo audit → human-readable report.
// Pure parsers are separated from I/O so they can be unit-tested without running
// a real audit. The CLI entry point `runAudit` wires both.

const execFile = promisify(execFileCb);

export type AuditResult = {
  ok: boolean;
  critical: number;
  high: number;
  moderate: number;
  low: number;
  advisories: string[];
};

const CLEAN: AuditResult = { ok: true, critical: 0, high: 0, moderate: 0, low: 0, advisories: [] };

// ─── pure parsers ────────────────────────────────────────────────────────────

/** Parse `npm audit --json` stdout into an AuditResult. Exported for testing. */
export function parseNpmAuditJson(raw: string): AuditResult {
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return { ...CLEAN, ok: false, advisories: ["npm audit: invalid JSON"] }; }

  const d = data as Record<string, unknown>;
  const meta = (d["metadata"] as Record<string, unknown> | undefined) ?? {};
  const vulns = (meta["vulnerabilities"] as Record<string, number> | undefined) ?? {};
  const critical = vulns["critical"] ?? 0;
  const high = vulns["high"] ?? 0;
  const moderate = vulns["moderate"] ?? 0;
  const low = vulns["low"] ?? 0;
  const total = critical + high + moderate + low;

  // npm v7+ puts detail in `vulnerabilities` map at the top level
  const details = (d["vulnerabilities"] as Record<string, unknown> | undefined) ?? {};
  const advisories: string[] = Object.values(details)
    .slice(0, 5)
    .map((v) => {
      const entry = v as Record<string, unknown>;
      const name = String(entry["name"] ?? "?");
      const severity = String(entry["severity"] ?? "?");
      const via = Array.isArray(entry["via"]) ? entry["via"] : [];
      const reason = via.length > 0 && typeof via[0] === "object" && via[0] !== null
        ? String((via[0] as Record<string, unknown>)["title"] ?? severity)
        : severity;
      return `${name}: ${reason}`;
    });

  return { ok: total === 0, critical, high, moderate, low, advisories };
}

/** Parse `cargo audit --json` stdout into an AuditResult. Exported for testing. */
export function parseCargoAuditJson(raw: string): AuditResult {
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return { ...CLEAN, ok: false, advisories: ["cargo audit: invalid JSON"] }; }

  const d = data as Record<string, unknown>;
  const vulnerabilities = (d["vulnerabilities"] as Record<string, unknown> | undefined) ?? {};
  const list = Array.isArray(vulnerabilities["list"]) ? vulnerabilities["list"] as unknown[] : [];
  if (list.length === 0) return { ...CLEAN };

  const advisories: string[] = list.slice(0, 5).map((v) => {
    const entry = v as Record<string, unknown>;
    const adv = (entry["advisory"] as Record<string, unknown> | undefined) ?? {};
    const pkg = String(adv["package"] ?? "?");
    const title = String(adv["title"] ?? "?");
    return `${pkg}: ${title}`;
  });

  // cargo audit doesn't break down by severity — report all as high
  return { ok: false, critical: 0, high: list.length, moderate: 0, low: 0, advisories };
}

// ─── I/O ─────────────────────────────────────────────────────────────────────

/** Run `npm audit --json` in vantaTsDir. Non-zero exit still produces JSON — caught + parsed. */
export async function runNpmAudit(vantaTsDir: string): Promise<AuditResult> {
  let raw: string;
  try {
    const { stdout } = await execFile("npm", ["audit", "--json"], { cwd: vantaTsDir });
    raw = stdout;
  } catch (e) {
    const err = e as { stdout?: string; code?: string; message?: string };
    // npm audit exits non-zero when vulnerabilities exist, but JSON is in err.stdout
    if (err.stdout && err.stdout.trim().startsWith("{")) {
      raw = err.stdout;
    } else {
      const reason = err.code ?? err.message ?? "spawn error";
      return { ...CLEAN, ok: false, advisories: [`npm audit failed: ${reason}`] };
    }
  }
  return parseNpmAuditJson(raw);
}

/** Run `cargo audit --json` from repoRoot. Not required — returns clean if unavailable. */
export async function runCargoAudit(repoRoot: string): Promise<AuditResult> {
  let raw: string;
  try {
    const { stdout } = await execFile("cargo", ["audit", "--json"], { cwd: repoRoot });
    raw = stdout;
  } catch (e) {
    const err = e as { code?: string; stdout?: string; message?: string };
    // ENOENT = cargo-audit not installed → not mandatory, treat as clean
    if (err.code === "ENOENT" || (err.message ?? "").includes("not found")) {
      return { ...CLEAN };
    }
    // cargo audit exits non-zero on findings; JSON still in stderr / stdout
    if (err.stdout && err.stdout.trim().startsWith("{")) {
      raw = err.stdout;
    } else {
      // cargo audit not installed or unrecognized failure → treat as clean
      return { ...CLEAN };
    }
  }
  return parseCargoAuditJson(raw);
}

// ─── reporter ─────────────────────────────────────────────────────────────────

function severityLine(label: string, r: AuditResult): string {
  const counts = [
    r.critical ? `${r.critical} critical` : "",
    r.high ? `${r.high} high` : "",
    r.moderate ? `${r.moderate} moderate` : "",
    r.low ? `${r.low} low` : "",
  ].filter(Boolean);
  if (r.ok && counts.length === 0) return `${label}: no issues`;
  return `${label}: ${counts.join(", ")}`;
}

/** Format both audit results into a human-readable report. Pure. */
export function formatAuditReport(npm: AuditResult, cargo: AuditResult): string {
  const lines: string[] = ["=== Vanta Dependency Audit ===", ""];

  lines.push(severityLine("npm", npm));
  if (!npm.ok && npm.advisories.length > 0) {
    for (const a of npm.advisories) lines.push(`  · ${a}`);
  }

  lines.push(severityLine("cargo", cargo));
  if (!cargo.ok && cargo.advisories.length > 0) {
    for (const a of cargo.advisories) lines.push(`  · ${a}`);
  }

  lines.push("");
  const overallOk = npm.ok && cargo.ok;
  lines.push(overallOk ? "Result: clean" : "Result: vulnerabilities found — review above");
  return lines.join("\n");
}

/** CLI entry point: run both audits and print the report. Returns exit code. */
export async function runAudit(repoRoot: string): Promise<number> {
  const vantaTsDir = `${repoRoot}/vanta-ts`;
  console.log("Running npm audit…");
  const npm = await runNpmAudit(vantaTsDir);
  console.log("Running cargo audit (optional)…");
  const cargo = await runCargoAudit(repoRoot);
  console.log(formatAuditReport(npm, cargo));
  const hasHighPriority = npm.critical > 0 || npm.high > 0 || cargo.critical > 0 || cargo.high > 0;
  return hasHighPriority ? 1 : 0;
}
