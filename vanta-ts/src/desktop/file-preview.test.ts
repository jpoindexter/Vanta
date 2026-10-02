import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readProjectPreview } from "./file-preview.js";

describe("read-only project document preview", () => {
  let root: string;
  beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "vanta-preview-")); });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); });
  it("reads a bounded UTF-8 document without modifying it", async () => {
    await writeFile(join(root, "brief.md"), "# A real document\nRead beside the chat.");
    expect(await readProjectPreview(root, "brief.md")).toEqual({ path: "brief.md", content: "# A real document\nRead beside the chat.", markdown: true });
  });
  it.each(["../outside.md", "/etc/passwd", ".env", ".env.local", "credentials.json", ".vanta/config.json", "script.html"])("refuses %s", async (path) => {
    await expect(readProjectPreview(root, path)).rejects.toThrow();
  });
  it("refuses symlinks, including safe-looking links to private files", async () => {
    await writeFile(join(root, ".env"), "synthetic-only");
    await symlink(join(root, ".env"), join(root, "safe.txt"));
    await expect(readProjectPreview(root, "safe.txt")).rejects.toThrow();
  });
  it("refuses binary and oversized documents", async () => {
    await writeFile(join(root, "binary.txt"), Buffer.from([65, 0, 66]));
    await writeFile(join(root, "large.txt"), "x".repeat(256 * 1024 + 1));
    await expect(readProjectPreview(root, "binary.txt")).rejects.toThrow();
    await expect(readProjectPreview(root, "large.txt")).rejects.toThrow();
  });
});
