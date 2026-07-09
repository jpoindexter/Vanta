import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SafetyClient } from "../safety-client.js";
import type { ToolContext } from "./types.js";
import { gitCommitTool, gitCheckoutTool, gitStatusTool } from "./git.js";
import { recordAgentEdit } from "../agents/attribution-store.js";

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
    repo = await mkdtemp(join(tmpdir(), "vanta-git-"));
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

  it("git_commit appends session attribution trailers when agent edits were recorded", async () => {
    await run("git", ["config", "user.email", "vanta@example.com"], { cwd: repo });
    await run("git", ["config", "user.name", "Vanta Test"], { cwd: repo });
    await run("git", ["remote", "add", "origin", "git@example.com:vanta/test.git"], { cwd: repo });
    await writeFile(join(repo, "x.txt"), "hello", "utf8");
    await recordAgentEdit(join(repo, ".vanta"), {
      sessionId: "s1",
      agent: "claude",
      path: "x.txt",
      content: "hello",
      remoteUrl: "git@example.com:vanta/test.git",
    });
    const ctx = { ...makeCtx(repo, async () => true), sessionId: "s1" };
    const result = await gitCommitTool.execute({ message: "feat: x" }, ctx);
    expect(result.ok).toBe(true);
    const log = await run("git", ["log", "-1", "--pretty=%B"], { cwd: repo });
    expect(log.stdout).toContain("Co-Authored-By: claude <agent@vanta.local>");
    expect(log.stdout).toContain("Vanta-Attribution: session=s1 files=1 remote=git@example.com:vanta/test.git");
  });

  it("rejects invalid args before reaching approval", async () => {
    const ctx = makeCtx(repo, async () => {
      throw new Error("approval must not be reached on invalid args");
    });
    const result = await gitCheckoutTool.execute({}, ctx);
    expect(result.ok).toBe(false);
  });
});
