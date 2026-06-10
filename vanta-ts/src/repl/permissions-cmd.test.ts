import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { permissions } from "./permissions-cmd.js";
import type { ReplCtx } from "./types.js";

let home: string;
beforeEach(async () => { home = await mkdtemp(join(tmpdir(), "vanta-perm-cmd-")); });
afterEach(async () => { await rm(home, { recursive: true, force: true }); });

const ctx = (): ReplCtx => ({ env: { ...process.env, VANTA_HOME: home } }) as unknown as ReplCtx;

async function out(arg: string): Promise<string> {
  return (await permissions(arg, ctx())).output ?? "";
}

describe("/permissions command", () => {
  it("adds, lists, then removes a rule (state round-trip)", async () => {
    expect(await out("")).toContain("no permission rules");
    await out("deny shell_cmd rm");
    const list = await out("");
    expect(list).toContain("shell_cmd");
    expect(list).toContain("deny");
    await out("remove 1");
    expect(await out("")).toContain("no permission rules");
  });

  it("shows usage on an incomplete add", async () => {
    expect(await out("allow")).toContain("usage");
  });
});
