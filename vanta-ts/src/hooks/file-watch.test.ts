import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hasFileChangedHooks, startHookFileWatcher } from "./file-watch.js";
import { shellHooksPath } from "./shell-hooks.js";

// fs.watch (FSEvents on macOS) arms asynchronously with no readiness signal, so a
// trigger write that lands before arming is MISSED, not delayed — a single write +
// long wait flakes under load. Re-fire the trigger each poll so a write is guaranteed
// to land after the watcher is armed; the marker then appears within one debounce.
async function waitForMarker(marker: string, trigger: () => Promise<void>): Promise<void> {
  for (let i = 0; i < 80; i++) {
    await trigger();
    if (await access(marker).then(() => true).catch(() => false)) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  await access(marker);
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
    await close();
  });

  it("fires for matching changed files", async () => {
    const marker = join(root, "file-hooked");
    await writeFile(shellHooksPath(dataDir), JSON.stringify({ FileChanged: [{ matcher: "watched.txt", command: `touch ${marker}` }] }));
    expect(await hasFileChangedHooks(dataDir)).toBe(true);
    const close = await startHookFileWatcher(root, { dataDir });
    try {
      let n = 0;
      await waitForMarker(marker, () => writeFile(join(root, "watched.txt"), `changed-${n++}`));
    } finally {
      await close();
    }
  });
});
