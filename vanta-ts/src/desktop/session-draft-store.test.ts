import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadDesktopSessionDraft, saveDesktopSessionDraft } from "./session-draft-store.js";

const homes: string[] = [];

afterEach(async () => {
  await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
});

async function testEnv(): Promise<NodeJS.ProcessEnv> {
  const home = await mkdtemp(join(tmpdir(), "vanta-desktop-drafts-"));
  homes.push(home);
  return { VANTA_HOME: home };
}

describe("desktop session draft store", () => {
  it("isolates drafts by project and session across store reloads", async () => {
    const env = await testEnv();
    await saveDesktopSessionDraft("/project/a", "one", "draft one", env);
    await saveDesktopSessionDraft("/project/a", "two", "draft two", env);

    await expect(loadDesktopSessionDraft("/project/a", "one", env)).resolves.toEqual({ exists: true, value: "draft one" });
    await expect(loadDesktopSessionDraft("/project/a", "two", env)).resolves.toEqual({ exists: true, value: "draft two" });
    await expect(loadDesktopSessionDraft("/project/b", "one", env)).resolves.toEqual({ exists: false, value: "" });
  });

  it("removes empty drafts and writes a private store", async () => {
    const env = await testEnv();
    await saveDesktopSessionDraft("/project/a", "one", "private prompt", env);
    const path = join(env.VANTA_HOME!, "desktop-session-drafts.json");
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect(await readFile(path, "utf8")).toContain("private prompt");

    await saveDesktopSessionDraft("/project/a", "one", "", env);
    await expect(loadDesktopSessionDraft("/project/a", "one", env)).resolves.toEqual({ exists: false, value: "" });
  });
});
