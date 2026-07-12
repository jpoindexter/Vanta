import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  analyzeDocRouter,
  appendDocRouterEvent,
  detectDocReferences,
  formatDocRouterHealth,
  listDocRouterEvents,
  type RouterDocument,
} from "./router-health.js";

describe("documentation router health", () => {
  it("records events durably and skips corrupt rows", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vanta-doc-router-"));
    await appendDocRouterEvent(dir, { kind: "loaded", path: "AGENTS.md", source: "prompt" }, new Date("2026-07-12T00:00:00Z"));
    await writeFile(join(dir, "doc-router-events.jsonl"), '{bad}\n' + JSON.stringify({ version: 1, ts: "2026-07-12T00:00:01Z", kind: "referenced", path: "AGENTS.md", source: "turn" }) + "\n", "utf8");
    const rows = await listDocRouterEvents(dir);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.kind).toBe("referenced");
  });

  it("detects loaded document references from a completed turn", () => {
    const refs = detectDocReferences(
      "I followed the repository rules in AGENTS.md and the architecture/INDEX.md router.",
      ["AGENTS.md", "docs/architecture/INDEX.md", "CLAUDE.md"],
    );
    expect(refs).toEqual(["AGENTS.md", "docs/architecture/INDEX.md"]);
  });

  it("reports stale, never-consulted, missing, and contradictory documents", () => {
    const docs: RouterDocument[] = [
      { path: "AGENTS.md", text: "Always run the release tests.", mtimeMs: Date.parse("2026-01-01") },
      { path: "CLAUDE.md", text: "Never run the release tests.", mtimeMs: Date.parse("2026-07-11") },
    ];
    const events = [
      { version: 1 as const, ts: "2026-07-12T00:00:00Z", kind: "loaded" as const, path: "AGENTS.md", source: "prompt" },
      { version: 1 as const, ts: "2026-07-12T00:00:00Z", kind: "loaded" as const, path: "CLAUDE.md", source: "prompt" },
      { version: 1 as const, ts: "2026-07-12T00:00:01Z", kind: "referenced" as const, path: "CLAUDE.md", source: "turn" },
      { version: 1 as const, ts: "2026-07-12T00:00:02Z", kind: "missing" as const, path: "docs/INDEX.md", source: "import" },
    ];
    const report = analyzeDocRouter(docs, events, {
      nowMs: Date.parse("2026-07-12T00:00:00Z"),
      staleAfterMs: 90 * 24 * 60 * 60 * 1000,
    });
    expect(report.stale).toEqual(["AGENTS.md"]);
    expect(report.neverConsulted).toEqual(["AGENTS.md"]);
    expect(report.missing).toEqual(["docs/INDEX.md"]);
    expect(report.contradictions).toHaveLength(1);
    expect(formatDocRouterHealth(report)).toContain("AGENTS.md");
    expect(formatDocRouterHealth(report).toLowerCase()).toContain("contradiction");
  });
});
