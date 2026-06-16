import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { EvalTaskSchema, type EvalTask } from "./types.js";

// Load the eval task corpus from a directory of *.json task files. Each file is
// one EvalTask, Zod-validated. Sorted by filename for stable ordering.

/** Parse + validate one task JSON. Throws actionably on a bad shape. */
export function parseTask(json: string): EvalTask {
  return EvalTaskSchema.parse(JSON.parse(json));
}

export function loadCorpus(dir: string): EvalTask[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => parseTask(readFileSync(join(dir, f), "utf8")));
}
