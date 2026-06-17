import { describe, it, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { nd } from "./nd-cmd.js";
import { loadNdConfig } from "../nd/profile.js";
import type { ReplCtx } from "./types.js";

const ctxWith = (env: NodeJS.ProcessEnv): ReplCtx => ({ env } as ReplCtx);

describe("/nd command", () => {
  it("lists gates with on/off markers", async () => {
    const r = await nd("", ctxWith({} as NodeJS.ProcessEnv));
    expect(r.output).toContain("executive-function gates");
    expect(r.output).toMatch(/research/);
  });

  it("toggles a gate off and persists it", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vanta-ndcmd-"));
    const env = { VANTA_HOME: dir } as NodeJS.ProcessEnv;
    try {
      const r = await nd("research off", ctxWith(env));
      expect(r.output).toContain("research off");
      expect((await loadNdConfig(env)).research.enabled).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("sets a threshold", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vanta-ndcmd-"));
    const env = { VANTA_HOME: dir } as NodeJS.ProcessEnv;
    try {
      await nd("hyperfocus 20", ctxWith(env));
      expect((await loadNdConfig(env)).hyperfocus.threshold).toBe(20);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects an unknown gate", async () => {
    const r = await nd("bogus off", ctxWith({} as NodeJS.ProcessEnv));
    expect(r.output).toContain("unknown gate");
  });
});
