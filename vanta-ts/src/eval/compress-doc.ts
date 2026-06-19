import type { CompressCngReport } from "./compress-run.js";
import type { DimensionResult, FlipDecision } from "./compress-cng.js";

// Pure markdown renderer for the CNG findings doc (docs/compression-cng.md). Kept
// separate from the harness so the I/O-free formatting stays trivially testable.

function row(d: DimensionResult, flip: FlipDecision): string {
  const v = d.verdict;
  const net = v.netPositive ? "yes" : "no";
  const flipped = flip.flip ? "**ON**" : "no";
  return `| ${d.name} | ${d.baseline.outputTokens.toLocaleString()} | ${d.treatment.outputTokens.toLocaleString()} | ${v.tokensSaved} | ${d.baseline.passAt1}% | ${d.treatment.passAt1}% | ${v.passDelta} | ${net} | ${flipped} |`;
}

/** Render the full findings doc. `provider`/`model` describe the configured backend
 * the live run used; `caveat` is the small-N directional-signal note. Pure. */
export function renderCngDoc(o: {
  report: CompressCngReport;
  provider: string;
  model: string;
  now: string;
}): string {
  const { report } = o;
  const lines: string[] = [];
  lines.push("# Compression CNG — pass-rate measurement (no logprobs)");
  lines.push("");
  lines.push(`Measured: ${o.now} · provider \`${o.provider}\` · model \`${o.model}\``);
  lines.push(`Corpus: ${report.corpusSize} task(s) × ${report.rollouts} rollout(s) · baseline pass@1 ${report.baseline.passAt1}% (${report.baseline.outputTokens.toLocaleString()} output tokens, all compression off)`);
  lines.push("");
  lines.push("CNG per dimension runs the corpus WITH vs WITHOUT that compression dimension on the configured provider. A dimension is **net-positive** iff it saved output tokens AND did not regress pass@1 (`tokensSaved > 0 && passDelta >= 0`). A default is flipped ON only where the signal is both net-positive and large enough to trust (>= 6 rollout-observations) — conservative by design.");
  lines.push("");
  lines.push("| dimension | base tokens | treat tokens | saved | base pass@1 | treat pass@1 | Δpp | net-positive | flipped |");
  lines.push("|---|---|---|---|---|---|---|---|---|");
  for (let i = 0; i < report.dimensions.length; i++) {
    lines.push(row(report.dimensions[i]!, report.flips[i]!));
  }
  lines.push("");
  lines.push("## Flip decisions");
  lines.push("");
  for (const f of report.flips) {
    lines.push(`- **${f.name}** — ${f.flip ? "FLIP ON" : "keep current default"}: ${f.reason}`);
  }
  lines.push("");
  lines.push("## Caveat");
  lines.push("");
  lines.push("This is a SMALL-N directional signal. The live run above is intentionally capped (few tasks, one rollout) so it completes in minutes, not a marathon. The numbers indicate direction, not a statistically settled effect size. Re-run with the full corpus and `VANTA_EVAL_ROLLOUTS>=2` for a flip-grade signal. Defaults were flipped ONLY where the measured CNG was clearly net-positive on a sufficient signal; everything else is recorded and left unchanged.");
  lines.push("");
  return lines.join("\n");
}
