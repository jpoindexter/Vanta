import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { shellHooksPath } from "./shell-hooks.js";
import { errorDetails, fireCwdChanged, fireStopFailure, stopFailureType } from "./runtime-events.js";

async function waitFor(path: string): Promise<void> {
  for (let i = 0; i < 20; i++) {
    if (await access(path).then(() => true).catch(() => false)) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  await access(path);
}

describe("runtime hook events", () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "vanta-runtime-events-"));
    await mkdir(join(root, ".vanta"));
  });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); });

  it("classifies stop failures for matcher routing", () => {
    expect(stopFailureType(new Error("429 Too Many Requests"))).toBe("rate_limit");
    expect(stopFailureType(new Error("authentication failed"))).toBe("authentication_failed");
    expect(stopFailureType(new Error("something odd"))).toBe("unknown");
    expect(errorDetails(new Error("boom"))).toBe("boom");
  });

  it("fires StopFailure with the error matcher", async () => {
    const marker = join(root, "stop-failed");
    await writeFile(shellHooksPath(join(root, ".vanta")), JSON.stringify({ StopFailure: [{ matcher: "rate_limit", command: `touch ${marker}` }] }));
    await fireStopFailure(root, { error: "rate_limit", errorDetails: "429" });
    await waitFor(marker);
  });

  it("fires CwdChanged when the run root changes", async () => {
    const marker = join(root, "cwd-changed");
    await writeFile(shellHooksPath(join(root, ".vanta")), JSON.stringify({ CwdChanged: [{ command: `touch ${marker}` }] }));
    await fireCwdChanged(root, "/old", root);
    await waitFor(marker);
  });
});
