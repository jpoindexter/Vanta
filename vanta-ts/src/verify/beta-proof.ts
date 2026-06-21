// BETA-LIVE-PROOF — the open-beta gate. Defines the core operator task paths a
// new user must be able to run, executes each via an injected live check, and
// records the proven-vs-still-gated list as evidence. The harness is pure +
// testable; the actual clean-machine run (and the gated paths' tokens) is the
// operator's. "Gated" = needs live setup this box can't provide (a clean machine,
// a channel token, whisper) — surfaced honestly, never silently passed.

export type BetaPath = {
  id: string;
  name: string;
  /** The observable end-to-end result that counts as "proven". */
  criterion: string;
  /** If set, the path needs live setup the dev box can't provide. Recorded, not run. */
  gated?: string;
};

export const BETA_PATHS: BetaPath[] = [
  {
    id: "install",
    name: "Install → working session",
    criterion: "one command installs; `vanta doctor` is green; an interactive session starts",
    gated: "a clean machine (not the dev box)",
  },
  {
    id: "does-a-task",
    name: "Does a real task",
    criterion: '`vanta run "read README and summarize"` returns a verified, non-empty summary',
  },
  {
    id: "multi-step",
    name: "Efficient multi-step work",
    criterion: "a run_pipeline fetch→transform→write collapses to one turn with only the final result returned",
  },
  {
    id: "safe",
    name: "Safe by default",
    criterion: "a destructive action (rm -rf, exfiltration) is BLOCKED by the kernel before execution",
  },
  {
    id: "reaches-you",
    name: "Reaches you on a channel",
    criterion: "a Telegram message reaches the agent and gets a reply from one gateway",
    gated: "a Telegram bot token",
  },
  {
    id: "media",
    name: "Images + voice in a channel",
    criterion: "an inbound image is understood; a voice memo is transcribed",
    gated: "a channel token + the whisper CLI",
  },
  {
    id: "scheduled",
    name: "Runs a scheduled job unattended",
    criterion: "a cron task fires at its time and delivers without any manual action",
    gated: "a configured channel + the OS scheduler",
  },
];

export type PathResult = { id: string; name: string; ok: boolean; evidence: string; gated?: string };
export type BetaReport = {
  proven: PathResult[];
  gated: PathResult[];
  /** True when every NON-gated path passed (the gate the dev box can assert). */
  ready: boolean;
};

export type BetaProofDeps = {
  /** Run one non-gated path's live check → {ok, evidence}. Injected. */
  run: (path: BetaPath) => Promise<{ ok: boolean; evidence: string }>;
};

/**
 * Run the beta-proof: each non-gated path is executed via the injected live check
 * and recorded with evidence; each gated path is recorded as needing its live
 * setup (never silently passed). Errors-as-values: a thrown check → a failed path.
 */
export async function runBetaProof(paths: BetaPath[], deps: BetaProofDeps): Promise<BetaReport> {
  const proven: PathResult[] = [];
  const gated: PathResult[] = [];
  for (const p of paths) {
    if (p.gated) {
      gated.push({ id: p.id, name: p.name, ok: false, evidence: `needs: ${p.gated}`, gated: p.gated });
      continue;
    }
    const r = await deps.run(p).catch((e) => ({ ok: false, evidence: e instanceof Error ? e.message : String(e) }));
    proven.push({ id: p.id, name: p.name, ok: r.ok, evidence: r.evidence });
  }
  return { proven, gated, ready: proven.every((r) => r.ok) };
}

/** Render the report as a recordable markdown evidence doc. Pure. */
export function formatBetaReport(report: BetaReport, now: string): string {
  const line = (r: PathResult, mark: string) =>
    `- ${mark} **${r.name}** — ${r.evidence}`;
  const lines = [
    "# Beta readiness — live-proof record",
    "",
    `_Generated ${now}. ${report.ready ? "All headless-provable paths green." : "Some headless-provable paths FAILED."}_`,
    "",
    "## Proven on this machine",
    ...report.proven.map((r) => line(r, r.ok ? "✅" : "❌")),
    "",
    "## Still gated — need live setup (run on a clean machine with these)",
    ...report.gated.map((r) => line(r, "🔒")),
    "",
    "> The gated paths are real code, offline-tested; they need the listed token/account/machine to be verified live.",
  ];
  return lines.join("\n");
}
