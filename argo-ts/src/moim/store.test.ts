import { describe, it, expect, beforeEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readMoim, writeMoim, clearMoim } from "./store.js";

async function makeEnv(): Promise<{ env: NodeJS.ProcessEnv; dir: string }> {
  const dir = await mkdtemp(join(tmpdir(), "argo-moim-"));
  return { env: { VANTA_HOME: dir }, dir };
}

describe("readMoim", () => {
  it("returns undefined when no note is set", async () => {
    const { env } = await makeEnv();
    expect(await readMoim(env)).toBeUndefined();
  });

  it("returns the note text after write", async () => {
    const { env } = await makeEnv();
    await writeMoim("finish the MOIM feature", env);
    expect(await readMoim(env)).toBe("finish the MOIM feature");
  });

  it("trims surrounding whitespace", async () => {
    const { env } = await makeEnv();
    await writeMoim("  debug the auth flow  ", env);
    expect(await readMoim(env)).toBe("debug the auth flow");
  });
});

describe("writeMoim", () => {
  it("replaces an existing note", async () => {
    const { env } = await makeEnv();
    await writeMoim("first note", env);
    await writeMoim("second note", env);
    expect(await readMoim(env)).toBe("second note");
  });
});

describe("clearMoim", () => {
  it("removes the note so readMoim returns undefined", async () => {
    const { env } = await makeEnv();
    await writeMoim("something", env);
    await clearMoim(env);
    expect(await readMoim(env)).toBeUndefined();
  });

  it("is safe to call when no note exists", async () => {
    const { env } = await makeEnv();
    await expect(clearMoim(env)).resolves.toBeUndefined();
  });
});
