import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SafetyClient } from "../safety-client.js";
import { readAttribution } from "../agents/attribution-store.js";
import { recordStreamEdits } from "./call-agent.js";
import type { ToolContext } from "./types.js";

const run = promisify(execFile);

describe("call_agent attribution recording", () => {
  let repo: string;

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "vanta-call-agent-"));
    await run("git", ["init"], { cwd: repo });
    await run("git", ["remote", "add", "origin", "git@example.com:vanta/test.git"], { cwd: repo });
    await mkdir(join(repo, "src"), { recursive: true });
    await writeFile(join(repo, "src/x.ts"), "final content", "utf8");
  });

  afterEach(async () => {
    await rm(repo, { recursive: true, force: true });
  });

  it("records final file content for streamed edited paths and includes remote URL", async () => {
    const ctx: ToolContext = {
      root: repo,
      sessionId: "sess1",
      safety: {} as SafetyClient,
      requestApproval: async () => true,
    };
    await recordStreamEdits(ctx, "claude", ["src/x.ts", "package-lock.json", "../outside.ts"]);
    const snap = await readAttribution(join(repo, ".vanta"), "sess1");
    expect(snap?.agent).toBe("claude");
    expect(snap?.remoteUrl).toBe("git@example.com:vanta/test.git");
    expect(snap?.files.map((f) => f.path)).toEqual(["src/x.ts"]);
  });
});
