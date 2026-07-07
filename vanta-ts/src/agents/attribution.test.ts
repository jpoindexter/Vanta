import { describe, it, expect } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hashContent, isGeneratedFile, newAttribution, recordEdit, coAuthoredBy, attributionTrailers, withTrailers } from "./attribution.js";
import { recordAgentEdit, trailersForSession, readAttribution } from "./attribution-store.js";

// VANTA-COMMIT-ATTRIBUTION.

describe("hashContent", () => {
  it("is stable and changes with content", () => {
    expect(hashContent("abc")).toBe(hashContent("abc"));
    expect(hashContent("abc")).not.toBe(hashContent("abd"));
  });
});

describe("isGeneratedFile", () => {
  it.each(["package-lock.json", "pnpm-lock.yaml", "Cargo.lock", "dist/app.js", "node_modules/x/i.js", "a.min.js", "b.js.map", ".vanta/x.json"])(
    "excludes generated %s", (p) => expect(isGeneratedFile(p)).toBe(true),
  );
  it.each(["src/index.ts", "README.md", "src/tools/x.ts"])("includes authored %s", (p) => expect(isGeneratedFile(p)).toBe(false));
});

describe("recordEdit", () => {
  it("adds an authored file, updates on re-edit (no dupes), sorted", () => {
    let s = newAttribution("sess1", "claude", "git@x:repo.git");
    s = recordEdit(s, "src/b.ts", "v1");
    s = recordEdit(s, "src/a.ts", "v1");
    s = recordEdit(s, "src/b.ts", "v2"); // update
    expect(s.files.map((f) => f.path)).toEqual(["src/a.ts", "src/b.ts"]); // sorted, deduped
    expect(s.files.find((f) => f.path === "src/b.ts")!.hash).toBe(hashContent("v2"));
  });
  it("ignores generated files", () => {
    const s = recordEdit(newAttribution("s", "claude"), "package-lock.json", "{}");
    expect(s.files).toEqual([]);
  });
});

describe("trailers", () => {
  it("coAuthoredBy formats the trailer line", () => {
    expect(coAuthoredBy("claude", "a@b.c")).toBe("Co-Authored-By: claude <a@b.c>");
  });
  it("attributionTrailers includes Co-Authored-By + metadata (session, files, remote)", () => {
    let s = newAttribution("sess1", "claude", "git@x:repo.git");
    s = recordEdit(s, "src/a.ts", "x");
    const t = attributionTrailers(s);
    expect(t[0]).toContain("Co-Authored-By: claude");
    expect(t[1]).toContain("session=sess1");
    expect(t[1]).toContain("files=1");
    expect(t[1]).toContain("remote=git@x:repo.git");
  });
  it("no trailers when nothing was attributed", () => {
    expect(attributionTrailers(newAttribution("s", "claude"))).toEqual([]);
  });
});

describe("withTrailers", () => {
  it("appends trailers with a blank-line separator", () => {
    expect(withTrailers("fix bug", ["Co-Authored-By: x <y>"])).toBe("fix bug\n\nCo-Authored-By: x <y>");
  });
  it("is idempotent — an already-present trailer is not duplicated", () => {
    const once = withTrailers("m", ["T1"]);
    expect(withTrailers(once, ["T1"])).toBe(once);
  });
  it("only appends the missing trailers", () => {
    const out = withTrailers("m\n\nT1", ["T1", "T2"]);
    expect(out).toContain("T2");
    expect(out.match(/T1/g)).toHaveLength(1);
  });
});

describe("attribution store (round-trip)", () => {
  it("records an agent edit and produces commit trailers for the session", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "vanta-attr-"));
    await recordAgentEdit(dataDir, { sessionId: "s1", agent: "claude", path: "src/x.ts", content: "code", remoteUrl: "r" });
    await recordAgentEdit(dataDir, { sessionId: "s1", agent: "claude", path: "yarn.lock", content: "{}" }); // generated → ignored
    const snap = await readAttribution(dataDir, "s1");
    expect(snap!.files.map((f) => f.path)).toEqual(["src/x.ts"]);
    const trailers = await trailersForSession(dataDir, "s1");
    expect(trailers[0]).toContain("Co-Authored-By: claude");
    expect(trailers[1]).toContain("files=1");
  });
  it("no snapshot → no trailers (best-effort)", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "vanta-attr-"));
    expect(await trailersForSession(dataDir, "none")).toEqual([]);
  });
});
