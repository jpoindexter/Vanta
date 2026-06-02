import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SafetyClient } from "../safety-client.js";
import type { ToolContext } from "./types.js";
import { gitCommitTool, gitCheckoutTool, gitStatusTool } from "./git.js";

const run = promisify(execFile);

function makeCtx(
  root: string,
  requestApproval: ToolContext["requestApproval"],
): ToolContext {
  // Git tools touch only root + requestApproval; safety is never read here.
  return { root, safety: {} as SafetyClient, requestApproval };
}

describe("git tools", () => {
  let repo: string;

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "argo-git-"));
    await run("git", ["init"], { cwd: repo });
  });

  afterEach(async () => {
    await rm(repo, { recursive: true, force: true });
  });

  it("git_status returns ok in a real repo without invoking approval", async () => {
    let asked = false;
    const ctx = makeCtx(repo, async () => {
      asked = true;
      return true;
    });
    const result = await gitStatusTool.execute({}, ctx);
    expect(result.ok).toBe(true);
    expect(asked).toBe(false);
  });

  it("git_commit returns denied and does not commit when approval is refused", async () => {
    const ctx = makeCtx(repo, async () => false);
    const result = await gitCommitTool.execute({ message: "feat: x" }, ctx);
    expect(result.ok).toBe(false);
    expect(result.output).toBe("denied");

    // No commit should exist: rev-parse HEAD must fail (code !== 0).
    const head = await run("git", ["rev-parse", "HEAD"], { cwd: repo }).then(
      () => 0,
      () => 1,
    );
    expect(head).toBe(1);
  });

  it("rejects invalid args before reaching approval", async () => {
    const ctx = makeCtx(repo, async () => {
      throw new Error("approval must not be reached on invalid args");
    });
    const result = await gitCheckoutTool.execute({}, ctx);
    expect(result.ok).toBe(false);
  });
});
