import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { MetaTuneRecord } from "./types.js";

export function writeMetaTuneRecord(repoRoot: string, record: MetaTuneRecord): string {
  const dir = join(repoRoot, ".vanta");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "meta-tune-instructions.json");
  writeFileSync(path, JSON.stringify(record, null, 2) + "\n", "utf8");
  return path;
}
