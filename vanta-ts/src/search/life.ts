import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveVantaHome } from "../store/home.js";

export type LifeHit = { source: string; snippet: string };

const SNIPPET_MAX = 120;
const DEFAULT_MAX = 12;
const LOCAL_STORE_NAMES = ["world", "money", "radar", "team"] as const;

/** Pure. Search named text blobs for q (case-insensitive); return up to max cited hits. */
export function searchBlobs(
  blobs: { source: string; text: string }[],
  q: string,
  max: number = DEFAULT_MAX,
): LifeHit[] {
  if (!q) return [];
  const lower = q.toLowerCase();
  const hits: LifeHit[] = [];
  for (const { source, text } of blobs) {
    for (const line of text.split("\n")) {
      if (line.toLowerCase().includes(lower)) {
        const snippet = line.length > SNIPPET_MAX ? line.slice(0, SNIPPET_MAX) + "…" : line;
        hits.push({ source, snippet });
        if (hits.length >= max) return hits;
      }
    }
  }
  return hits;
}

async function readBestEffort(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

/** Read Vanta's local stores (world/money/radar/team JSONL + repo ERRORS.md) as named blobs. */
export async function gatherLifeBlobs(
  env: NodeJS.ProcessEnv,
  repoRoot: string,
): Promise<{ source: string; text: string }[]> {
  const home = resolveVantaHome(env);
  const blobs: { source: string; text: string }[] = [];

  for (const name of LOCAL_STORE_NAMES) {
    const text = await readBestEffort(join(home, `${name}.jsonl`));
    if (text !== null) blobs.push({ source: name, text });
  }

  const errors = await readBestEffort(join(repoRoot, "ERRORS.md"));
  if (errors !== null) blobs.push({ source: "errors", text: errors });

  return blobs;
}
