import { describe, expect, it } from "vitest";
import type { PreferenceSignal } from "../preferences/signals.js";
import {
  DEFAULT_DENIAL_CAP,
  extractDenials,
  formatDenials,
  readRecentDenials,
} from "./denial-history.js";

// A row factory mirroring signalFromApprovalDecision's shape: a human denial sets
// chosen.value "deny" and context "<reason>: <action>"; an approval sets "allow".
function row(opts: {
  chosen?: "allow" | "deny";
  reason?: string;
  action?: string;
  tool?: string;
  ts?: string;
  kind?: PreferenceSignal["kind"];
  context?: string;
}): PreferenceSignal {
  const chosen = opts.chosen ?? "deny";
  const rejected = chosen === "deny" ? "allow" : "deny";
  const context = opts.context ?? `${opts.reason ?? "blocked"}: ${opts.action ?? "rm -rf /"}`;
  return {
    id: `id-${opts.ts ?? "x"}`,
    timestamp: opts.ts ?? "2026-06-21T12:00:00.000Z",
    kind: opts.kind ?? "approval_decision",
    context,
    chosen: { label: chosen, value: chosen },
    rejected: { label: rejected, value: rejected },
    provenance: { source: "human_approval", toolName: opts.tool },
  };
}

const NOW = Date.parse("2026-06-21T12:10:00.000Z");

describe("extractDenials", () => {
  it("keeps only denied rows, skipping approvals and non-approval kinds", () => {
    const rows = [
      row({ chosen: "deny", tool: "shell_cmd", action: "rm -rf /" }),
      row({ chosen: "allow", tool: "read_file", action: "read x" }),
      row({ chosen: "deny", kind: "retry", action: "ignored kind" }),
    ];
    const out = extractDenials(rows);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ tool: "shell_cmd", action: "rm -rf /", reason: "blocked" });
  });

  it("orders denials newest first by timestamp", () => {
    const rows = [
      row({ ts: "2026-06-21T10:00:00.000Z", action: "old" }),
      row({ ts: "2026-06-21T11:00:00.000Z", action: "new" }),
      row({ ts: "2026-06-21T10:30:00.000Z", action: "mid" }),
    ];
    expect(extractDenials(rows).map((d) => d.action)).toEqual(["new", "mid", "old"]);
  });

  it("caps at the default (20) newest, dropping older overflow", () => {
    const rows = Array.from({ length: 25 }, (_, i) =>
      row({ ts: `2026-06-21T${String(i).padStart(2, "0")}:00:00.000Z`, action: `a${i}` }),
    );
    const out = extractDenials(rows);
    expect(out).toHaveLength(DEFAULT_DENIAL_CAP);
    expect(out[0]!.action).toBe("a24"); // newest
    expect(out.at(-1)!.action).toBe("a5"); // 20th-newest; a4..a0 dropped
  });

  it("honors an explicit cap and falls back to default on a non-positive cap", () => {
    const rows = [row({ action: "a" }), row({ action: "b" }), row({ action: "c" })];
    expect(extractDenials(rows, 2)).toHaveLength(2);
    expect(extractDenials(rows, 0)).toHaveLength(3); // 0 → default (>=3 here)
  });

  it("splits context into reason + action, defaulting when no separator", () => {
    const out = extractDenials([row({ context: "no-separator-action" })]);
    expect(out[0]).toMatchObject({ reason: "denied", action: "no-separator-action" });
  });

  it("falls back to (unknown) when provenance lacks a toolName", () => {
    expect(extractDenials([row({ tool: undefined })])[0]!.tool).toBe("(unknown)");
  });
});

describe("formatDenials", () => {
  it("renders the empty view when there are no denials", () => {
    expect(formatDenials([], NOW)).toBe("  no recent denials");
  });

  it("shows tool, action, reason, and a relative time per row", () => {
    const records = extractDenials([
      row({ ts: "2026-06-21T12:05:00.000Z", tool: "shell_cmd", reason: "kernel block", action: "rm -rf /" }),
    ]);
    const out = formatDenials(records, NOW);
    expect(out).toContain("recent denials (newest first):");
    expect(out).toContain("✘ shell_cmd rm -rf / — kernel block (5m ago)");
  });

  it("strips control/ANSI escapes from action and reason so history can't inject", () => {
    const records = extractDenials([
      row({
        tool: "git_push",
        // ANSI ESC + bell + a C1 char embedded in both action and reason
        context: "reason: action",
      }),
    ]);
    const out = formatDenials(records, NOW);
    expect(out).not.toContain("");
    expect(out).not.toContain("");
    expect(out).not.toContain("");
    expect(out).toContain("✘ git_push action — reason");
  });
});

describe("readRecentDenials", () => {
  it("reads → extracts → formats via the injected reader", async () => {
    const rows = [
      row({ ts: "2026-06-21T12:00:00.000Z", tool: "shell_cmd", reason: "blocked", action: "rm -rf /" }),
      row({ chosen: "allow", action: "approved" }),
    ];
    const out = await readRecentDenials({ readSignals: async () => rows, nowMs: NOW });
    expect(out).toContain("✘ shell_cmd rm -rf / — blocked (10m ago)");
    expect(out).not.toContain("approved");
  });

  it("degrades to the empty view when the reader fails (errors-as-values)", async () => {
    const out = await readRecentDenials({
      readSignals: async () => {
        throw new Error("read failure");
      },
      nowMs: NOW,
    });
    expect(out).toBe("  no recent denials");
  });

  it("shows the empty view when the reader yields no denials", async () => {
    const out = await readRecentDenials({
      readSignals: async () => [row({ chosen: "allow", action: "approved" })],
      nowMs: NOW,
    });
    expect(out).toBe("  no recent denials");
  });
});
