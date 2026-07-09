export type HarnessSource = {
  path: string;
  text: string;
};

export type ThicknessCandidate = {
  path: string;
  line: number;
  kind: "explicit-marker" | "hard-rule" | "duplicate-rule";
  reason: string;
  text: string;
  action: string;
};

export type ThicknessMetrics = {
  sourceCount: number;
  totalBytes: number;
  estimatedTokens: number;
  hardRuleLines: number;
  candidateCount: number;
};

export type ThicknessRun = {
  ts: string;
  metrics: ThicknessMetrics;
  candidates: ThicknessCandidate[];
};

export type ThicknessTrend = {
  previousBytes?: number;
  deltaBytes?: number;
  direction: "first-run" | "down" | "flat" | "up";
};

export type RemoveLineResult =
  | { ok: true; text: string; removed: string }
  | { ok: false; error: string };

const HARD_RULE = /\b(always|never|must|required|do not|don't|no exceptions|before any|after each|without)\b/i;
const EXPLICIT_MARKER = /\b(scaffold|temporary|temp|todo|fixme|legacy|deprecated|workaround|remove when|no longer needs?)\b/i;

export function estimateTokens(bytes: number): number {
  return Math.round(bytes / 4);
}

export function auditHarnessThickness(sources: HarnessSource[], now = new Date()): ThicknessRun {
  const candidates: ThicknessCandidate[] = [];
  const hardRules = collectHardRules(sources);
  for (const source of sources) {
    const lines = source.text.split("\n");
    lines.forEach((line, idx) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      if (EXPLICIT_MARKER.test(trimmed)) {
        candidates.push({
          path: source.path,
          line: idx + 1,
          kind: "explicit-marker",
          reason: "line is marked as scaffold, temporary, legacy, deprecated, or workaround",
          text: trimmed,
          action: `Review whether this scaffold can be deleted now; remove with: vanta harness-thickness remove ${source.path}:${idx + 1} --expected "${quoteExpected(trimmed)}"`,
        });
      } else if (isHardRule(trimmed) && trimmed.length > 160) {
        candidates.push({
          path: source.path,
          line: idx + 1,
          kind: "hard-rule",
          reason: "long hard rule adds prompt weight and may be internalized by stronger models",
          text: trimmed,
          action: "Shorten the rule or move examples out of the always-loaded harness.",
        });
      }
    });
  }
  for (const rule of duplicateRules(hardRules)) {
    candidates.push({
      path: rule.path,
      line: rule.line,
      kind: "duplicate-rule",
      reason: `similar hard rule appears ${rule.count} times across harness sources`,
      text: rule.text,
      action: "Keep one source of truth and delete or reference the duplicate.",
    });
  }

  const totalBytes = sources.reduce((sum, source) => sum + Buffer.byteLength(source.text), 0);
  const hardRuleLines = hardRules.length;
  return {
    ts: now.toISOString(),
    metrics: {
      sourceCount: sources.length,
      totalBytes,
      estimatedTokens: estimateTokens(totalBytes),
      hardRuleLines,
      candidateCount: candidates.length,
    },
    candidates: candidates.sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line),
  };
}

export function thicknessTrend(current: ThicknessRun, previous?: ThicknessRun): ThicknessTrend {
  if (!previous) return { direction: "first-run" };
  const deltaBytes = current.metrics.totalBytes - previous.metrics.totalBytes;
  const direction = deltaBytes < 0 ? "down" : deltaBytes > 0 ? "up" : "flat";
  return { previousBytes: previous.metrics.totalBytes, deltaBytes, direction };
}

export function parseThicknessRuns(jsonl: string): ThicknessRun[] {
  return jsonl
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as ThicknessRun];
      } catch {
        return [];
      }
    })
    .filter((run) => typeof run.ts === "string" && typeof run.metrics?.totalBytes === "number");
}

export function formatThicknessReport(run: ThicknessRun, trend: ThicknessTrend, limit = 8): string {
  const trendLine = trend.direction === "first-run"
    ? "trend: first run"
    : `trend: ${trend.direction} (${signed(trend.deltaBytes ?? 0)} B vs previous)`;
  const rows = run.candidates.slice(0, limit).map((candidate) =>
    `  ${candidate.path}:${candidate.line} · ${candidate.kind} · ${candidate.reason}\n    ${candidate.text}\n    action: ${candidate.action}`,
  );
  return [
    "=== Harness Thickness Audit ===",
    `sources: ${run.metrics.sourceCount}`,
    `thickness: ${run.metrics.totalBytes.toLocaleString()} B · ~${run.metrics.estimatedTokens.toLocaleString()} tok`,
    `hard-rule lines: ${run.metrics.hardRuleLines}`,
    `prune candidates: ${run.metrics.candidateCount}`,
    trendLine,
    "",
    rows.length ? "Top candidates:" : "Top candidates: none",
    ...rows,
  ].join("\n");
}

export function removeCandidateLine(text: string, lineNumber: number, expected?: string): RemoveLineResult {
  if (!Number.isInteger(lineNumber) || lineNumber < 1) return { ok: false, error: "line number must be positive" };
  const lines = text.split("\n");
  const idx = lineNumber - 1;
  const line = lines[idx];
  if (line === undefined) return { ok: false, error: "line number is outside the file" };
  if (expected && !line.includes(expected)) {
    return { ok: false, error: "expected text did not match the target line" };
  }
  lines.splice(idx, 1);
  return { ok: true, text: lines.join("\n"), removed: line };
}

function collectHardRules(sources: HarnessSource[]): Array<{ path: string; line: number; text: string; key: string }> {
  const rules: Array<{ path: string; line: number; text: string; key: string }> = [];
  for (const source of sources) {
    source.text.split("\n").forEach((line, idx) => {
      const text = line.trim();
      if (!isHardRule(text)) return;
      rules.push({ path: source.path, line: idx + 1, text, key: normalizeRule(text) });
    });
  }
  return rules;
}

function duplicateRules(rules: Array<{ path: string; line: number; text: string; key: string }>): Array<{ path: string; line: number; text: string; count: number }> {
  const counts = new Map<string, number>();
  for (const rule of rules) counts.set(rule.key, (counts.get(rule.key) ?? 0) + 1);
  return rules
    .filter((rule) => rule.key.length > 28 && (counts.get(rule.key) ?? 0) > 1)
    .map((rule) => ({ path: rule.path, line: rule.line, text: rule.text, count: counts.get(rule.key) ?? 0 }));
}

function isHardRule(line: string): boolean {
  return HARD_RULE.test(line);
}

function normalizeRule(line: string): string {
  return line
    .toLowerCase()
    .replace(/[`"'*_#()[\]{}:;,.!?]/g, "")
    .replace(/\b(vanta|codex|claude|agent|user)\b/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

function quoteExpected(text: string): string {
  return text.slice(0, 60).replace(/"/g, '\\"');
}
