import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export const dependencyRoots = ["vanta-ts", "vanta-website", "vanta-ts/packages/sdk"];

// A failed request, malformed response, or incomplete audit must never look green.
export function assessAudit(result) {
  if (result.error) return { ok: false, reason: "audit process failed" };
  let report;
  try { report = JSON.parse(result.stdout); }
  catch { return { ok: false, reason: "audit did not return JSON" }; }
  const counts = report?.metadata?.vulnerabilities;
  const findings = report?.vulnerabilities;
  if (report?.error || !counts || !findings || typeof findings !== "object" || Array.isArray(findings)) {
    return { ok: false, reason: "audit returned an error or incomplete report" };
  }
  const levels = ["info", "low", "moderate", "high", "critical", "total"];
  const zero = levels.every((level) => counts[level] === 0);
  const empty = Object.keys(findings).length === 0;
  return {
    ok: result.status === 0 && zero && empty,
    reason: result.status === 0 && zero && empty ? "zero reported vulnerabilities" : "audit failed or vulnerabilities remain",
    counts,
  };
}

export function checkDependencies(run = spawnSync) {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const results = dependencyRoots.map((directory) => {
    const audit = run(process.platform === "win32" ? "npm.cmd" : "npm", ["audit", "--package-lock-only", "--json"], {
      cwd: resolve(root, directory), encoding: "utf8", timeout: 120_000, maxBuffer: 10 * 1024 * 1024,
    });
    return { directory, ...assessAudit(audit) };
  });
  return { ok: results.every((result) => result.ok), results };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = checkDependencies();
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.ok ? 0 : 1;
}
