import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { extractUserArchiveText, scanJobProfileArchives } from "./job-profile-scan.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(): Promise<string> {
  const root = join(tmpdir(), `vanta-job-profile-${Date.now()}-${Math.random()}`);
  roots.push(root);
  await mkdir(root, { recursive: true });
  return root;
}

describe("job profile archive scan", () => {
  it("extracts only user-authored text from supported archive shapes", () => {
    expect(extractUserArchiveText(JSON.stringify({ role: "user", content: "portfolio role" }))).toBe("portfolio role");
    expect(extractUserArchiveText(JSON.stringify({ message: { role: "user", content: [{ type: "text", text: "resume role" }] } }))).toBe("resume role");
    expect(extractUserArchiveText(JSON.stringify({ role: "assistant", content: "job" }))).toBeNull();
    expect(extractUserArchiveText("not-json")).toBeNull();
  });

  it("bounds files and matches, skips subagents, and redacts credentials", async () => {
    const root = await fixture();
    await mkdir(join(root, "subagents"));
    await writeFile(join(root, "session.jsonl"), [
      JSON.stringify({ role: "assistant", content: "job from assistant" }),
      JSON.stringify({ role: "user", content: "Portfolio target token=ghp_123456789012345678901234567890123456" }),
      JSON.stringify({ message: { role: "user", content: "Product designer job in Europe" } }),
    ].join("\n"));
    await writeFile(join(root, "subagents", "hidden.jsonl"), JSON.stringify({ role: "user", content: "secret job" }));
    const result = await scanJobProfileArchives({ roots: [root], max_files: 10, max_matches: 1, max_chars: 500 });

    expect(result.filesFound).toBe(1);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]?.text).toContain("Portfolio target");
    expect(result.matches[0]?.text).not.toContain("ghp_123456");
  });
});
