import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hasFileChangedHooks, startHookFileWatcher } from "./file-watch.js";
import { shellHooksPath } from "./shell-hooks.js";

async function waitFor(path: string): Promise<void> {
  for (let i = 0; i < 30; i++) {
    if (await access(path).then(() => true).catch(() => false)) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  await access(path);
}

describe("FileChanged hook watcher", () => {
  let root: string;
  let dataDir: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "vanta-file-watch-"));
    dataDir = join(root, ".vanta");
    await mkdir(dataDir);
  });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); });

  it("does not start when FileChanged is not configured", async () => {
    await writeFile(shellHooksPath(dataDir), JSON.stringify({ Stop: [{ command: "true" }] }));
    expect(await hasFileChangedHooks(dataDir)).toBe(false);
    const close = await startHookFileWatcher(root, { dataDir });
    close();
  });

  it("fires for matching changed files", async () => {
    const marker = join(root, "file-hooked");
    await writeFile(shellHooksPath(dataDir), JSON.stringify({ FileChanged: [{ matcher: "watched.txt", command: `touch ${marker}` }] }));
    expect(await hasFileChangedHooks(dataDir)).toBe(true);
    const close = await startHookFileWatcher(root, { dataDir });
    try {
      await writeFile(join(root, "watched.txt"), "changed");
      await waitFor(marker);
    } finally {
      close();
    }
  });
});
