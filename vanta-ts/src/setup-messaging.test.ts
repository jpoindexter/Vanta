import { describe, it, expect, vi } from "vitest";
import { access, mkdtemp, mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { messagingPlatformById } from "./gateway/platforms/registry.js";
import {
  buildMessagingEnv,
  renderMessagingMenu,
  renderSetupSteps,
  runMessagingSetup,
  validateTelegramAllowlist,
  validateTelegramToken,
} from "./setup-messaging.js";

describe("buildMessagingEnv", () => {
  it("writes the secret env for telegram", () => {
    const tg = messagingPlatformById("telegram")!;
    expect(buildMessagingEnv(tg, "123:abc")).toEqual({ VANTA_TELEGRAM_TOKEN: "123:abc" });
  });

  it("writes the enable flag (no secret) for an enable-flag platform (imessage)", () => {
    const im = messagingPlatformById("imessage")!;
    expect(buildMessagingEnv(im)).toEqual({ VANTA_IMESSAGE_ENABLE: "1" });
  });

  it("omits the secret key when no secret is given", () => {
    const tg = messagingPlatformById("telegram")!;
    expect(buildMessagingEnv(tg)).toEqual({});
  });
});

describe("Telegram setup validation", () => {
  it("accepts BotFather token syntax and numeric owner allowlists", () => {
    expect(validateTelegramToken(`123456:${"a".repeat(35)}`)).toBe(true);
    expect(validateTelegramToken("123:abc")).toBe(false);
    expect(validateTelegramAllowlist("123456,-100987")).toBe(true);
    expect(validateTelegramAllowlist("@owner")).toBe(false);
  });

  it("verifies Telegram before writing the token and owner allowlist", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-telegram-setup-"));
    await mkdir(join(root, "vanta-ts"), { recursive: true });
    const token = `123456:${"a".repeat(35)}`;
    const answers = ["123456,-100987"];
    const rl = { question: vi.fn(async () => answers.shift() ?? ""), close: vi.fn() };
    const probe = vi.fn(async () => ({ ok: true, detail: "Telegram bot vanta_test responded" }));
    const lines: string[] = [];

    await expect(runMessagingSetup(root, rl as never, {
      platformId: "telegram",
      env: {},
      askSecret: async () => token,
      probe,
      log: (line) => lines.push(line),
    })).resolves.toBe(true);

    expect(probe).toHaveBeenCalledWith(expect.objectContaining({ VANTA_TELEGRAM_TOKEN: token }));
    const written = await readFile(join(root, "vanta-ts", ".env"), "utf8");
    expect(written).toContain(`VANTA_TELEGRAM_TOKEN=${token}`);
    expect(written).toContain("VANTA_TELEGRAM_ALLOW=123456,-100987");
    expect(lines.join("\n")).toContain("Verified Telegram bot vanta_test responded");
  });

  it("preserves disk state when Telegram verification fails", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-telegram-setup-fail-"));
    await mkdir(join(root, "vanta-ts"), { recursive: true });
    const rl = { question: vi.fn(), close: vi.fn() };

    await expect(runMessagingSetup(root, rl as never, {
      platformId: "telegram",
      env: {},
      askSecret: async () => `123456:${"b".repeat(35)}`,
      probe: async () => ({ ok: false, detail: "Telegram token rejected" }),
      log: () => {},
    })).resolves.toBe(false);
    await expect(access(join(root, "vanta-ts", ".env"))).rejects.toThrow();
  });
});

describe("renderMessagingMenu", () => {
  it("tags telegram configured when its token is present, available when not", () => {
    expect(renderMessagingMenu({ VANTA_TELEGRAM_TOKEN: "x" })).toMatch(/Telegram\s+\[configured\]/);
    expect(renderMessagingMenu({})).toMatch(/Telegram\s+\[available\]/);
  });

  it("shows every catalogued platform as available/configured (all implemented now)", () => {
    const menu = renderMessagingMenu({});
    // Full channel-parity sweep landed: no platform is still `planned`.
    expect(menu).not.toMatch(/\[planned\]/);
    expect(menu).toMatch(/Teams.*\[available\]/);
    expect(menu).not.toMatch(/iMessage.*\[planned\]/);
    expect(menu).not.toMatch(/WhatsApp.*\[planned\]/);
  });
});

describe("renderSetupSteps", () => {
  it("includes the prerequisite + setup steps for whatsapp (Cloud API)", () => {
    const out = renderSetupSteps(messagingPlatformById("whatsapp")!);
    expect(out).toMatch(/prerequisite:/);
    expect(out).toMatch(/Cloud API/i);
  });

  it("numbers the telegram steps and shows the BotFather link", () => {
    const out = renderSetupSteps(messagingPlatformById("telegram")!);
    expect(out).toMatch(/1\. Open @BotFather/);
    expect(out).toMatch(/t\.me\/BotFather/);
  });
});
