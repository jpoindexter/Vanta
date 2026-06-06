import { describe, it, expect } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadAlwaysAllow, addAlwaysAllow } from "./approvals-store.js";

async function tmpEnv(): Promise<NodeJS.ProcessEnv> {
  const dir = await mkdtemp(join(tmpdir(), "argo-approvals-"));
  return { VANTA_HOME: dir } as NodeJS.ProcessEnv;
}

describe("approvals-store", () => {
  it("returns an empty list when nothing is persisted", async () => {
    expect(await loadAlwaysAllow(await tmpEnv())).toEqual([]);
  });

  it("persists a tool and reads it back", async () => {
    const env = await tmpEnv();
    await addAlwaysAllow("git_commit", env);
    expect(await loadAlwaysAllow(env)).toEqual(["git_commit"]);
  });

  it("is idempotent — adding the same tool twice keeps one entry", async () => {
    const env = await tmpEnv();
    await addAlwaysAllow("git_push", env);
    await addAlwaysAllow("git_push", env);
    await addAlwaysAllow("send_email", env);
    expect(await loadAlwaysAllow(env)).toEqual(["git_push", "send_email"]);
  });
});
