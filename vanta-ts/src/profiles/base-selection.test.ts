import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { baseProfileSelection, carryBaseProfileSelection } from "./base-selection.js";
import { activateProfileEnvironment, createProfile } from "./store.js";
import { listProfileViews } from "../desktop/profiles-view.js";

const roots: string[] = [];
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "vanta-base-selection-")); roots.push(root);
  const home = join(root, "home");
  await mkdir(join(root, ".vanta"), { recursive: true });
  await mkdir(join(root, "vanta-ts")); await mkdir(home);
  return { root, home, env: { VANTA_HOME: home, VANTA_PROJECT_ROOT: root } as NodeJS.ProcessEnv };
}
const settings = (file: string, model: string) => writeFile(file, JSON.stringify({ env: { VANTA_MODEL: model, VANTA_PROVIDER: "custom" } }));
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

describe("base/default provider selection", () => {
  it("retains a genuine base launch override across named activation and catalog lookup", async () => {
    const { home, env } = await fixture();
    await settings(join(home, "settings.json"), "base-settings");
    await createProfile({ name: "writer", provider: "ollama", model: "writer-model" }, env);
    env.VANTA_MODEL = "base-ambient"; env.VANTA_PROVIDER = "custom"; env.VANTA_PROFILE = "writer";
    await activateProfileEnvironment(env);
    expect(env).toMatchObject({ VANTA_MODEL: "writer-model", VANTA_PROVIDER: "ollama" });
    expect((await listProfileViews(env))[0]).toMatchObject({ model: "base-ambient", provider: "custom", home });
    const cloned = { ...env }; carryBaseProfileSelection(env, cloned);
    expect((await listProfileViews(cloned))[0]).toMatchObject({ model: "base-ambient", provider: "custom", home });
    const other = await fixture(); carryBaseProfileSelection(env, other.env);
    expect(await baseProfileSelection(other.env)).toEqual({ model: null, provider: null });
  });

  it("discards named values and legacy aliases, replaying project > worktree > base env before settings", async () => {
    const { root, home, env } = await fixture();
    await settings(join(root, ".vanta", "settings.local.json"), "local-settings");
    await writeFile(join(home, ".env"), "VANTA_MODEL=home-env\nVANTA_PROVIDER=custom\n");
    await writeFile(join(root, "vanta-ts", ".env"), "VANTA_MODEL=worktree-env\n");
    await writeFile(join(root, ".vanta", ".env"), "VANTA_MODEL=project-env\n");
    Object.assign(env, { VANTA_PROFILE_BASE_HOME: home, VANTA_HOME: join(home, "profiles", "writer"),
      VANTA_PROFILE: "writer", VANTA_MODEL: "named", VANTA_PROVIDER: "ollama", ARGO_MODEL: "named-alias", ARGO_PROVIDER: "ollama" });
    expect(await baseProfileSelection(env)).toEqual({ model: "project-env", provider: "custom" });
    expect(env.VANTA_MODEL).toBe("named");
  });

  it("uses the existing layered settings priority when no env selection exists, and invents nothing", async () => {
    const { root, home, env } = await fixture();
    await settings(join(home, "settings.json"), "base");
    await settings(join(root, ".vanta", "settings.json"), "project");
    await settings(join(root, ".vanta", "settings.local.json"), "local");
    expect(await baseProfileSelection(env)).toEqual({ model: "local", provider: "custom" });
    const empty = await fixture();
    expect(await baseProfileSelection(empty.env)).toEqual({ model: null, provider: null });
  });
});
