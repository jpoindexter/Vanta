import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  inspectProfileDistribution,
  installProfileDistribution,
  updateProfileDistribution,
} from "./distribution.js";
import { listProfileInbox, listProfiles, profileHome, targetProfile } from "./store.js";

const exec = promisify(execFile);
let root: string;
let source: string;
let home: string;
let env: NodeJS.ProcessEnv;

async function git(...args: string[]): Promise<string> {
  const result = await exec("git", args, { cwd: source });
  return result.stdout.trim();
}

async function writeFixture(soul = "You are a research specialist.\n", model = "gpt-5.5"): Promise<void> {
  await mkdir(join(source, "skills", "research"), { recursive: true });
  await writeFile(join(source, "vanta-profile.json"), JSON.stringify({
    version: 1,
    name: "Research Lead",
    profile: { provider: "codex", model, gatewayIdentity: "research-bot" },
    soul: "SOUL.md",
    settings: "settings.json",
    skills: ["skills/research"],
    cron: "cron.json",
    mcp: "mcp.json",
  }, null, 2) + "\n");
  await writeFile(join(source, "SOUL.md"), soul);
  await writeFile(join(source, "settings.json"), JSON.stringify({ ui: { theme: "dark" }, env: { VANTA_EFFORT_LEVEL: "high" } }, null, 2) + "\n");
  await writeFile(join(source, "skills", "research", "SKILL.md"), "---\nname: research\ndescription: Research deeply\n---\n\nUse sources.\n");
  await writeFile(join(source, "cron.json"), JSON.stringify([{ id: "daily-scan", cron: "0 9 * * *", instruction: "Scan sources" }]) + "\n");
  await writeFile(join(source, "mcp.json"), JSON.stringify({ servers: { papers: { command: "papers-mcp" } } }) + "\n");
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "vanta-profile-dist-"));
  source = join(root, "source");
  home = join(root, "home");
  env = { VANTA_HOME: home };
  await mkdir(source, { recursive: true });
  await writeFixture();
  await git("init", "-q");
  await git("config", "user.email", "test@example.com");
  await git("config", "user.name", "Test");
  await git("add", ".");
  await git("commit", "-qm", "initial");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("profile distributions", () => {
  it("previews explicit capability files and records the source commit", async () => {
    const preview = await inspectProfileDistribution(source);
    expect(preview.profileId).toBe("research-lead");
    expect(preview.sourceCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(preview.files).toEqual([
      "SOUL.md", "mcp.json", "scheduled_tasks.json", "settings.json", "skills/research/SKILL.md",
    ]);
  });

  it("refuses a distribution containing secrets or private history", async () => {
    await writeFile(join(source, ".env"), "OPENAI_API_KEY=do-not-import\n");
    await expect(inspectProfileDistribution(source)).rejects.toThrow("refuses secret/history file: .env");
    await rm(join(source, ".env"));
    await mkdir(join(source, "sessions"));
    await writeFile(join(source, "sessions", "private.json"), "{}\n");
    await expect(inspectProfileDistribution(source)).rejects.toThrow("refuses secret/history file: sessions/private.json");
  });

  it("refuses secret-shaped JSON fields and referenced symlink escapes", async () => {
    await writeFile(join(source, "settings.json"), JSON.stringify({ env: { OPENAI_API_KEY: "not-a-real-secret" } }));
    await expect(inspectProfileDistribution(source)).rejects.toThrow("refuses secret field: settings.json:env.OPENAI_API_KEY");
    await writeFile(join(source, "settings.json"), "{}\n");
    const outside = join(root, "outside-soul.md");
    await writeFile(outside, "outside\n");
    await rm(join(source, "SOUL.md"));
    await symlink(outside, join(source, "SOUL.md"));
    await expect(inspectProfileDistribution(source)).rejects.toThrow("distribution path escapes source through symlink: SOUL.md");
  });

  it("installs capability into an isolated profile without source history", async () => {
    const installed = await installProfileDistribution(source, env);
    const target = profileHome(installed.profile.id, env);
    expect(installed.profile.id).toBe("research-lead");
    expect(installed.sourceCommit).toMatch(/^[0-9a-f]{40}$/);
    await expect(readFile(join(target, "SOUL.md"), "utf8")).resolves.toContain("research specialist");
    await expect(readFile(join(target, "skills", "research", "SKILL.md"), "utf8")).resolves.toContain("Use sources");
    await expect(readFile(join(target, "scheduled_tasks.json"), "utf8")).resolves.toContain("daily-scan");
    await expect(readFile(join(target, "mcp.json"), "utf8")).resolves.toContain("papers-mcp");
    await expect(readFile(join(target, "distribution.json"), "utf8")).resolves.toContain(installed.sourceCommit);
    await expect(readFile(join(target, "memories", "profile.md"), "utf8")).resolves.toBe("");
  });

  it("updates owned files with a backup while preserving local state and overrides", async () => {
    await installProfileDistribution(source, env);
    const target = profileHome("research-lead", env);
    await targetProfile("research-lead", "private queued work", env);
    await writeFile(join(target, "memories", "profile.md"), "private memory\n");
    await writeFile(join(target, "settings.json"), JSON.stringify({ ui: { theme: "light" }, operatorOnly: true }, null, 2) + "\n");

    await writeFixture("You are an updated research specialist.\n", "gpt-5.6");
    await git("add", ".");
    await git("commit", "-qm", "update");
    const preview = await updateProfileDistribution("research-lead", env, { apply: false });
    expect(preview.changed).toContain("SOUL.md");
    expect(preview.applied).toBe(false);

    const updated = await updateProfileDistribution("research-lead", env, { apply: true });
    expect(updated.applied).toBe(true);
    expect(updated.backupDir).toContain(join("backups", "distribution-"));
    await expect(readFile(join(target, "SOUL.md"), "utf8")).resolves.toContain("updated research specialist");
    await expect(readFile(join(target, "memories", "profile.md"), "utf8")).resolves.toBe("private memory\n");
    expect((await listProfileInbox("research-lead", env))[0]?.instruction).toBe("private queued work");
    const settings = JSON.parse(await readFile(join(target, "settings.json"), "utf8"));
    expect(settings.ui.theme).toBe("light");
    expect(settings.operatorOnly).toBe(true);
    expect((await listProfiles(env)).find((profile) => profile.id === "research-lead")?.model).toBe("gpt-5.6");
  });

  it("removes stale owned files after backing them up", async () => {
    await installProfileDistribution(source, env);
    const manifest = JSON.parse(await readFile(join(source, "vanta-profile.json"), "utf8"));
    delete manifest.mcp;
    await writeFile(join(source, "vanta-profile.json"), JSON.stringify(manifest, null, 2) + "\n");
    await git("add", ".");
    await git("commit", "-qm", "remove mcp");

    const updated = await updateProfileDistribution("research-lead", env, { apply: true });
    expect(updated.changed).toContain("mcp.json");
    await expect(readFile(join(profileHome("research-lead", env), "mcp.json"), "utf8")).rejects.toThrow();
    await expect(readFile(join(updated.backupDir as string, "mcp.json"), "utf8")).resolves.toContain("papers-mcp");
  });

  it("refuses a tampered installed destination that escapes the profile home", async () => {
    await installProfileDistribution(source, env);
    const target = profileHome("research-lead", env);
    const record = JSON.parse(await readFile(join(target, "distribution.json"), "utf8"));
    record.files[0].destination = "../../outside.md";
    await writeFile(join(target, "distribution.json"), JSON.stringify(record, null, 2) + "\n");
    await expect(updateProfileDistribution("research-lead", env, { apply: true }))
      .rejects.toThrow("installed distribution path escapes profile: ../../outside.md");
  });
});
