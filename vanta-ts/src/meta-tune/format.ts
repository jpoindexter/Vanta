import type { MetaTuneRecord, ProgramScore } from "./types.js";

function fmt(s: ProgramScore): string {
  return `pass@1 ${s.passAt1}% · CNG ${s.cng} · out ${s.outputTokens}`;
}

export function formatMetaTuneRecord(r: MetaTuneRecord): string {
  const lines = [`baseline: ${fmt(r.baseline)}`];
  for (const v of r.variants) lines.push(`iter ${v.iter}: ${v.kept ? "kept" : "rejected"} · ${fmt(v.score)} · ${v.summary}`);
  lines.push(r.best ? `best: iter ${r.best.iter} (${r.adopted ? "adopted" : "recorded"})` : "best: no improvement");
  return lines.join("\n");
}
