import { normalizeEntry, type BrainEntry } from "../brain/entry-types.js";
import type { RecallResult } from "../brain/interface.js";
import type { MemoryProvider, RecallOpts, RememberOpts } from "./provider.js";
import type { MsaClient } from "./msa-client.js";
import type { MsaHit } from "./msa-protocol.js";

function confidence(score: number | undefined): number {
  if (score === undefined) return 0.7;
  return score < 0 ? (score + 1) / 2 : score;
}

export function msaHitToBrainEntry(
  hit: MsaHit,
  region = "semantic",
  now = new Date(),
): BrainEntry {
  const conf = confidence(hit.score);
  return normalizeEntry({
    id: hit.id,
    region,
    content: hit.text,
    entryType: "artifact",
    strength: conf,
    confidence: conf,
    salience: conf,
    sourceType: "external",
    sourceRef: `msa:${hit.source ?? hit.id}`,
  }, now);
}

function recallResult(hits: MsaHit[], region: string | undefined): RecallResult {
  const entries = hits.map((hit) => msaHitToBrainEntry(hit, region));
  return {
    entries,
    activations: [],
    formatted: entries
      .map((entry) => `[msa|conf:${entry.confidence.toFixed(2)}] ${entry.content.slice(0, 300)}`)
      .join("\n"),
  };
}
/**
 * MSA augments the local brain; it never becomes the only copy. Writes land
 * locally first, then index remotely. Reads prefer usable MSA hits and fall back
 * to local memory on an empty, invalid, timed-out, or unavailable response.
 */
export function makeMsaMemoryProvider(
  local: MemoryProvider,
  client: MsaClient,
): MemoryProvider {
  return {
    id: "msa",
    async remember(text: string, opts?: RememberOpts): Promise<BrainEntry> {
      const entry = await local.remember(text, opts);
      await client.index({
        namespace: opts?.region,
        documents: [{
          id: entry.id,
          text: entry.content,
          metadata: { region: entry.region, source: "vanta-local-brain" },
        }],
      });
      return entry;
    },
    async recall(query: string, opts?: RecallOpts): Promise<RecallResult> {
      const remote = await client.query({
        query,
        topK: opts?.topK ?? 10,
        namespace: opts?.region,
      });
      if (!remote.ok || remote.value.results.length === 0) {
        return local.recall(query, opts);
      }
      return recallResult(remote.value.results, opts?.region);
    },
  };
}
