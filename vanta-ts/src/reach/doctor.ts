import type { ChannelStatus } from "./channel.js";

const GLYPH = { ok: "✓", warn: "~", off: "✘" } as const;

/** Pure: render a reach doctor report from per-channel statuses. */
export function formatDoctor(statuses: ChannelStatus[]): string {
  if (statuses.length === 0) return "No reach channels registered.";
  const off = statuses.filter((s) => s.status === "off").length;
  const head =
    off === 0
      ? `Reach — ${statuses.length} channel(s), all reachable`
      : `Reach — ${off}/${statuses.length} channel(s) unreachable`;

  const width = Math.max(...statuses.map((s) => s.name.length));
  const lines = statuses.map((s) => {
    const backend = s.activeBackend ?? "—";
    const row = `  ${GLYPH[s.status]} ${s.name.padEnd(width)}  ${backend}${s.detail ? ` · ${s.detail}` : ""}`;
    const fix = s.status !== "ok" && s.fix ? `\n      fix: ${s.fix}` : "";
    return row + fix;
  });
  return [head, ...lines].join("\n");
}
