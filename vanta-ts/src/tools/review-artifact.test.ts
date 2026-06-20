import { describe, it, expect } from "vitest";
import { buildReviewArtifactTool, reviewArtifactTool, type ArtifactFs } from "./review-artifact.js";
import type { ToolContext } from "./types.js";

const ROOT = "/repo";

/** In-memory fs seam: seed existing files, record writes. */
function fakeFs(seed: Record<string, string> = {}): ArtifactFs & { writes: Record<string, string> } {
  const store: Record<string, string> = { ...seed };
  const writes: Record<string, string> = {};
  return {
    writes,
    async readFile(abs) {
      if (abs in store) return store[abs]!;
      const err = new Error("ENOENT") as NodeJS.ErrnoException;
      err.code = "ENOENT";
      throw err;
    },
    async writeFile(abs, content) {
      store[abs] = content;
      writes[abs] = content;
    },
  };
}

function ctx(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    root: ROOT,
    safety: {} as ToolContext["safety"],
    requestApproval: async () => true,
    ...overrides,
  };
}

describe("review_artifact", () => {
  it("writes a NEW artifact when the review is approved", async () => {
    const fs = fakeFs();
    const tool = buildReviewArtifactTool(fs);
    const res = await tool.execute({ path: "notes.md", content: "# Title\nbody" }, ctx());
    expect(res.ok).toBe(true);
    expect(res.output).toContain("approved");
    expect(res.output).toContain("new file");
    expect(fs.writes[`${ROOT}/notes.md`]).toBe("# Title\nbody");
    // the diff is surfaced for the host to render
    expect(res.diff?.some((d) => d.type === "add")).toBe(true);
  });

  it("does NOT write when the review is rejected — file left unchanged", async () => {
    const fs = fakeFs({ [`${ROOT}/app.ts`]: "const a = 1;\n" });
    const tool = buildReviewArtifactTool(fs);
    const res = await tool.execute(
      { path: "app.ts", content: "const a = 2;\n" },
      ctx({ requestApproval: async () => false }),
    );
    expect(res.ok).toBe(false);
    expect(res.output).toContain("rejected");
    expect(res.output).toContain("left unchanged");
    expect(fs.writes).toEqual({}); // nothing written
  });

  it("computes the diff against the EXISTING file (edit, not new)", async () => {
    const fs = fakeFs({ [`${ROOT}/app.ts`]: "alpha\nbeta\ngamma\n" });
    let askedReason = "";
    const tool = buildReviewArtifactTool(fs);
    const res = await tool.execute(
      { path: "app.ts", content: "alpha\nBETA\ngamma\n" },
      ctx({
        requestApproval: async (_action, reason) => {
          askedReason = reason;
          return true;
        },
      }),
    );
    expect(res.ok).toBe(true);
    expect(res.output).toContain("edit");
    expect(askedReason).toContain("+1 -1"); // one line changed
    expect(res.diff?.some((d) => d.type === "remove" && d.text === "beta")).toBe(true);
    expect(res.diff?.some((d) => d.type === "add" && d.text === "BETA")).toBe(true);
  });

  it("is a no-op when the proposed artifact already matches the file (no approval, no write)", async () => {
    const fs = fakeFs({ [`${ROOT}/same.txt`]: "identical\n" });
    let asked = false;
    const tool = buildReviewArtifactTool(fs);
    const res = await tool.execute(
      { path: "same.txt", content: "identical\n" },
      ctx({ requestApproval: async () => { asked = true; return true; } }),
    );
    expect(res.ok).toBe(true);
    expect(res.output).toContain("already matches");
    expect(asked).toBe(false); // never asks when there's nothing to review
    expect(fs.writes).toEqual({});
  });

  it("errors-as-values on missing args (never throws)", async () => {
    const res = await reviewArtifactTool.execute({ path: "x.md" }, ctx());
    expect(res.ok).toBe(false);
    expect(res.output).toContain("review_artifact needs");
  });

  it("errors-as-values when the write fails (never throws)", async () => {
    const fs = fakeFs();
    fs.writeFile = async () => { throw new Error("EACCES: permission denied"); };
    const tool = buildReviewArtifactTool(fs);
    const res = await tool.execute({ path: "blocked.md", content: "x" }, ctx());
    expect(res.ok).toBe(false);
    expect(res.output).toContain("could not write");
    expect(res.output).toContain("EACCES");
  });

  it("describeForSafety surfaces only the path for the kernel, never the content", () => {
    const desc = reviewArtifactTool.describeForSafety?.({ path: "secrets.env", content: "API_KEY=shhh" });
    expect(desc).toBe("review artifact secrets.env");
    expect(desc).not.toContain("shhh");
  });
});
