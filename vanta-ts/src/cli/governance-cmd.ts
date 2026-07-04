import { join, dirname } from "node:path";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { parseGateEvents, filterSince, formatAuditReport } from "../governance/audit.js";

// PAPER-GOVERNANCE-AUDIT — `vanta governance export` renders an externally-
// auditable report of every gated action + kernel verdict + final resolution,
// sourced from this install's tamper-evident `.vanta/events.jsonl` (EU AI Act
// oversight/transparency; arXiv:2604.14228 §12.5). Distinct from `vanta audit`
// (dependency-vulnerability scan) — different subject entirely.

const USAGE = "Usage: vanta governance export [--since <ISO date>] [--out <path>]";

/** Parse a `--flag value` pair out of argv, or undefined if absent. */
function flagValue(argv: string[], flag: string): string | undefined {
  const idx = argv.indexOf(flag);
  return idx !== -1 ? argv[idx + 1] : undefined;
}

export async function runGovernanceCommand(repoRoot: string, rest: string[]): Promise<number> {
  if (rest[0] !== "export") {
    console.log(USAGE);
    return rest[0] === undefined ? 1 : 0;
  }

  const dataDir = join(repoRoot, ".vanta");
  const eventsPath = join(dataDir, "events.jsonl");
  const jsonl = existsSync(eventsPath) ? readFileSync(eventsPath, "utf8") : "";
  let records = parseGateEvents(jsonl);

  const sinceRaw = flagValue(rest, "--since");
  if (sinceRaw) {
    const sinceMs = Date.parse(sinceRaw);
    if (Number.isNaN(sinceMs)) {
      console.error(`invalid --since date: "${sinceRaw}" (expected an ISO date, e.g. 2026-07-01)`);
      return 1;
    }
    records = filterSince(records, Math.floor(sinceMs / 1000));
  }

  const report = formatAuditReport(records);
  const outPath = flagValue(rest, "--out") ?? join(dataDir, "governance-audit.md");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, report, "utf8");
  console.log(report);
  console.log(`\nwritten → ${outPath}`);
  return 0;
}
