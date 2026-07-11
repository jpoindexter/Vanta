import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { createProfile, switchProfile } from "../profiles/store.js";

const exec = promisify(execFile);
let home: string;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "vanta-profiles-live-"));
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

describe("vanta profiles command dispatch", () => {
  it("reloads the active profile and lists it through the real CLI entry point", async () => {
    const env = { VANTA_HOME: home } as NodeJS.ProcessEnv;
    await createProfile({ name: "Research Lead", provider: "codex", model: "gpt-5.5" }, env);
    await switchProfile("research-lead", env);

    const result = await exec(process.execPath, ["--import", "tsx", "src/cli.ts", "profiles", "list"], {
      cwd: process.cwd(),
      env: { ...process.env, VANTA_HOME: home },
      timeout: 10_000,
    });
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("research-lead · active · codex/gpt-5.5");
  });
});
