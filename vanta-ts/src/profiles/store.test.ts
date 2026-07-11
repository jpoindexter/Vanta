import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  activateProfileEnvironment,
  archiveProfile,
  cloneProfile,
  createProfile,
  listProfileInbox,
  listProfiles,
  profileHome,
  switchProfile,
  targetProfile,
} from "./store.js";

let baseHome: string;
let env: NodeJS.ProcessEnv;
const at = (iso: string) => () => new Date(iso);

beforeEach(async () => {
  baseHome = await mkdtemp(join(tmpdir(), "vanta-profiles-"));
  env = { VANTA_HOME: baseHome };
});

afterEach(async () => {
  await rm(baseHome, { recursive: true, force: true });
});

describe("profile store", () => {
  it("creates an isolated specialist that survives reload", async () => {
    const created = await createProfile({
      name: "Research Lead",
      model: "gpt-5.5",
      provider: "codex",
      gatewayIdentity: "research-lead",
      allowedTools: ["read_file", "web_search"],
    }, env, at("2026-07-11T12:00:00.000Z"));

    expect(created.id).toBe("research-lead");
    expect(created.status).toBe("idle");
    expect(created.home).toBe(profileHome("research-lead", env));
    expect((await listProfiles(env)).map((profile) => profile.id)).toEqual(["research-lead"]);
    await expect(readFile(join(created.home, "settings.json"), "utf8")).resolves.toContain("gpt-5.5");
    await expect(readFile(join(created.home, "settings.json"), "utf8")).resolves.toContain("web_search");
    expect(created.allowedTools).toEqual(["read_file", "web_search"]);
    await expect(readFile(join(created.home, "identity.json"), "utf8")).resolves.toContain("research-lead");
  });

  it("targets by name and persists inbox plus last-work state", async () => {
    await createProfile({ name: "Research Lead" }, env, at("2026-07-11T12:00:00.000Z"));
    const message = await targetProfile("Research Lead", "Audit the provider fallback", env, at("2026-07-11T12:05:00.000Z"));

    expect(message.profileId).toBe("research-lead");
    expect(message.status).toBe("queued");
    expect((await listProfileInbox("research-lead", env))[0]?.instruction).toBe("Audit the provider fallback");
    const [profile] = await listProfiles(env);
    expect(profile?.status).toBe("queued");
    expect(profile?.lastWork).toBe("Audit the provider fallback");
  });

  it("clones configuration without private memory or queued work", async () => {
    await createProfile({ name: "Research Lead", model: "gpt-5.5", provider: "codex", allowedTools: ["read_file"] }, env);
    await targetProfile("research-lead", "private assignment", env);
    const clone = await cloneProfile("research-lead", "Research Backup", env, at("2026-07-11T12:10:00.000Z"));

    expect(clone.clonedFrom).toBe("research-lead");
    expect(clone.model).toBe("gpt-5.5");
    expect(clone.allowedTools).toEqual(["read_file"]);
    expect(await listProfileInbox(clone.id, env)).toEqual([]);
    await expect(readFile(join(clone.home, "memories", "profile.md"), "utf8")).resolves.toBe("");
  });

  it("switches the next process into the profile home and can archive it", async () => {
    await createProfile({ name: "Research Lead", model: "gpt-5.5", provider: "codex" }, env);
    await switchProfile("research-lead", env, at("2026-07-11T12:15:00.000Z"));
    const restarted: NodeJS.ProcessEnv = { VANTA_HOME: baseHome };

    const active = await activateProfileEnvironment(restarted);
    expect(active?.id).toBe("research-lead");
    expect(restarted.VANTA_PROFILE_BASE_HOME).toBe(baseHome);
    expect(restarted.VANTA_HOME).toBe(profileHome("research-lead", { VANTA_PROFILE_BASE_HOME: baseHome }));
    expect(restarted.VANTA_PROFILE).toBe("research-lead");
    expect(restarted.VANTA_MODEL).toBe("gpt-5.5");
    expect(restarted.VANTA_PROVIDER).toBe("codex");

    await archiveProfile("research-lead", { VANTA_PROFILE_BASE_HOME: baseHome }, at("2026-07-11T12:20:00.000Z"));
    const nextRestart: NodeJS.ProcessEnv = { VANTA_HOME: baseHome };
    expect(await activateProfileEnvironment(nextRestart)).toBeNull();
    expect(nextRestart.VANTA_HOME).toBe(baseHome);
  });

  it("rejects duplicate names and traversal-like identifiers", async () => {
    await createProfile({ name: "Research Lead" }, env);
    await expect(createProfile({ name: "Research Lead" }, env)).rejects.toThrow("already exists");
    await expect(targetProfile("../../research-lead", "x", env)).rejects.toThrow("profile not found");
  });
});
