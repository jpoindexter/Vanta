import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { desktopArtifacts, desktopMessagingPlatforms, saveDesktopMessagingPlatform, testDesktopMessagingPlatform } from "./operator-data.js";
import { saveSession } from "../sessions/store.js";

describe("desktop operator data", () => {
  let home = "";
  let root = "";
  const initialEnv = { home: process.env.VANTA_HOME, telegram: process.env.VANTA_TELEGRAM_TOKEN, telegramAllow: process.env.VANTA_TELEGRAM_ALLOW };

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "vanta-operator-home-"));
    root = await mkdtemp(join(tmpdir(), "vanta-operator-root-"));
    process.env.VANTA_HOME = home;
    delete process.env.VANTA_TELEGRAM_TOKEN;
    delete process.env.VANTA_TELEGRAM_ALLOW;
  });

  afterEach(async () => {
    if (initialEnv.home === undefined) delete process.env.VANTA_HOME; else process.env.VANTA_HOME = initialEnv.home;
    if (initialEnv.telegram === undefined) delete process.env.VANTA_TELEGRAM_TOKEN; else process.env.VANTA_TELEGRAM_TOKEN = initialEnv.telegram;
    if (initialEnv.telegramAllow === undefined) delete process.env.VANTA_TELEGRAM_ALLOW; else process.env.VANTA_TELEGRAM_ALLOW = initialEnv.telegramAllow;
    await Promise.all([rm(home, { recursive: true, force: true }), rm(root, { recursive: true, force: true })]);
  });

  it("reports messaging readiness without exposing saved credentials", async () => {
    const before = desktopMessagingPlatforms(process.env).find((platform) => platform.id === "telegram");
    expect(before).toMatchObject({ status: "needs_setup", configured: false, missing: ["VANTA_TELEGRAM_TOKEN"] });
    await expect(testDesktopMessagingPlatform("telegram")).resolves.toMatchObject({ status: "needs_setup" });
    const token = `123456:${"a".repeat(35)}`;
    const probe = async () => ({ ok: true, detail: "Telegram bot vanta_test responded" });
    const saved = await saveDesktopMessagingPlatform(root, "telegram", { VANTA_TELEGRAM_TOKEN: token, accessMode: "pairing" }, { probe });
    expect(saved).toMatchObject({ status: "ready", configured: true, missing: [] });
    await expect(testDesktopMessagingPlatform("telegram", process.env, { probe })).resolves.toMatchObject({ status: "ready" });
    expect(JSON.stringify(saved)).not.toContain(token);
  });

  it("rejects an unverified Telegram token without changing disk state", async () => {
    await mkdir(join(root, ".vanta"), { recursive: true });
    const envPath = join(root, ".vanta", ".env");
    await writeFile(envPath, "KEEP_ME=yes\n", "utf8");
    const token = `123456:${"b".repeat(35)}`;
    await expect(saveDesktopMessagingPlatform(root, "telegram", {
      VANTA_TELEGRAM_TOKEN: token,
      accessMode: "pairing",
    }, { probe: async () => ({ ok: false, detail: "Telegram token rejected" }) })).rejects.toThrow("Nothing was saved");
    await expect(readFile(envPath, "utf8")).resolves.toBe("KEEP_ME=yes\n");
    expect(process.env.VANTA_TELEGRAM_TOKEN).toBeUndefined();
  });

  it("collects saved output links and project files as artifacts", async () => {
    await mkdir(join(root, "docs"), { recursive: true });
    await writeFile(join(root, "docs", "result.md"), "result", "utf8");
    await saveSession("artifact-session", [{ role: "assistant", content: "Read docs/result.md and cite https://example.test/result" }], { env: process.env, title: "Artifact work" });
    const artifacts = await desktopArtifacts(root);
    expect(artifacts).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "file", value: "docs/result.md", sessionTitle: "Artifact work" }),
      expect.objectContaining({ kind: "link", value: "https://example.test/result", sessionTitle: "Artifact work" }),
    ]));
  });
});
