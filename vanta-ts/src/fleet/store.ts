import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FleetReportSchema, type FleetReport } from "./types.js";

function fleetsDir(repoRoot: string): string {
  return join(repoRoot, ".vanta", "fleets");
}

export function fleetPath(repoRoot: string, id: string): string {
  return join(fleetsDir(repoRoot), `${id}.json`);
}

export function saveFleetReport(repoRoot: string, report: FleetReport): void {
  mkdirSync(fleetsDir(repoRoot), { recursive: true });
  writeFileSync(fleetPath(repoRoot, report.id), JSON.stringify(report, null, 2) + "\n", "utf8");
}

export function loadFleetReport(repoRoot: string, id: string): FleetReport {
  return FleetReportSchema.parse(JSON.parse(readFileSync(fleetPath(repoRoot, id), "utf8")));
}

export function latestFleetId(repoRoot: string): string | null {
  const dir = fleetsDir(repoRoot);
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  return files.at(-1)?.replace(/\.json$/, "") ?? null;
}
