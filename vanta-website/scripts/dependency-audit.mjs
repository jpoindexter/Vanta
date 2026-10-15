import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { assertSafeBuildInputs } from "./image-build-security.mjs";

const ALLOWED_ADVISORIES = new Set([
  "GHSA-5p2g-fcmc-qvqq",
  "GHSA-w3rx-r6r6-pgpr",
]);
const REVIEW_BEFORE = "2026-10-01";
const WEBSITE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function advisoryId(via) {
  const match = via?.url?.match(/GHSA-[a-z0-9-]+/i);
  return match?.[0] ?? `source:${via?.source ?? "unknown"}`;
}

function resolveAdvisories(vulnerabilities) {
  const packages = Object.keys(vulnerabilities);
  const resolved = new Map(packages.map((name) => [
    name,
    new Set((vulnerabilities[name].via ?? []).flatMap((via) => (
      typeof via === "string" ? [] : [advisoryId(via)]
    ))),
  ]));
  let changed = true;
  while (changed) {
    changed = false;
    for (const name of packages) {
      for (const via of vulnerabilities[name].via ?? []) {
        if (typeof via !== "string") continue;
        const dependencyAdvisories = resolved.get(via);
        if (!dependencyAdvisories) throw new Error(`Dependency audit references missing package ${via}`);
        for (const id of dependencyAdvisories) {
          if (resolved.get(name).has(id)) continue;
          resolved.get(name).add(id);
          changed = true;
        }
      }
    }
  }
  const unresolved = packages.filter((name) => resolved.get(name).size === 0);
  if (unresolved.length > 0) {
    throw new Error(`Dependency audit has unresolved advisory paths: ${unresolved.join(", ")}`);
  }
  return [...new Set(packages.flatMap((name) => [...resolved.get(name)]))].sort();
}

export function assessAudit(audit, now = new Date()) {
  if (audit.error) {
    throw new Error(`npm audit did not complete: ${audit.error.summary ?? "unknown error"}`);
  }
  if (!audit.metadata?.vulnerabilities && !audit.vulnerabilities) {
    throw new Error("npm audit returned an incomplete result");
  }
  const vulnerabilities = audit.vulnerabilities ?? {};
  const packages = Object.keys(vulnerabilities);
  if (packages.length === 0) {
    return { advisoryIds: [], expandedPackages: 0, status: "pass" };
  }
  const ids = resolveAdvisories(vulnerabilities);
  const unexpected = ids.filter((id) => !ALLOWED_ADVISORIES.has(id));
  if (unexpected.length > 0) {
    throw new Error(`Unexpected dependency advisories: ${unexpected.join(", ")}`);
  }
  if (now >= new Date(`${REVIEW_BEFORE}T00:00:00Z`)) {
    throw new Error(`The image-size risk acceptance expired on ${REVIEW_BEFORE}`);
  }
  return { advisoryIds: ids, expandedPackages: packages.length, status: "bounded-exception" };
}

function assertPinnedAffectedVersion() {
  const lock = JSON.parse(readFileSync(resolve(WEBSITE_ROOT, "package-lock.json"), "utf8"));
  const version = lock.packages?.["node_modules/image-size"]?.version;
  if (version !== "2.0.2") {
    throw new Error(`Reassess the image-size mitigation for version ${version ?? "missing"}`);
  }
}

function runAudit() {
  const result = spawnSync("npm", ["audit", "--omit=dev", "--json"], {
    cwd: WEBSITE_ROOT,
    encoding: "utf8",
  });
  if (!result.stdout) throw new Error(result.stderr || "npm audit returned no JSON output");
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(result.stderr || `npm audit exited ${result.status}`);
  }
  const assessment = assessAudit(JSON.parse(result.stdout));
  if (assessment.status === "pass") {
    console.log("dependency-audit: PASS (npm reported zero advisories)");
    return;
  }
  assertPinnedAffectedVersion();
  assertSafeBuildInputs(WEBSITE_ROOT);
  console.log(
    `dependency-audit: PASS WITH BOUNDED BUILD-TIME EXCEPTION (${assessment.advisoryIds.length} advisories expanded through ${assessment.expandedPackages} packages; review before ${REVIEW_BEFORE})`,
  );
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  try {
    runAudit();
  } catch (error) {
    console.error(`dependency-audit: FAIL: ${error.message}`);
    process.exitCode = 1;
  }
}
