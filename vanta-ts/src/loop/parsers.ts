export function parseScore(text: string): number | null {
  const m = text.match(/SCORE:\s*(-?[\d.]+)/i);
  if (!m || m[1] === undefined) return null;
  const n = parseFloat(m[1]);
  if (isNaN(n)) return null;
  return Math.min(1, Math.max(0, n));
}

export function parseReasoning(text: string): string | null {
  const matches = [...text.matchAll(/REASONING:\s*(.+)/gi)];
  if (!matches.length) return null;
  return matches.map((m) => m[1]!.trim()).join("; ");
}

export function parseEscalation(text: string): string | null {
  const m = text.match(/ESCALATE:\s*(.+)/i);
  if (!m || m[1] === undefined) return null;
  return m[1].split("\n")[0]!.trim();
}
