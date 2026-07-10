import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saveCookie } from "../cookie.js";
import { twitterChannel } from "./twitter.js";

describe("twitter channel live check", () => {
  let home: string;
  beforeEach(() => { home = mkdtempSync(join(tmpdir(), "vanta-twitter-channel-")); });
  afterEach(() => { vi.restoreAllMocks(); rmSync(home, { recursive: true, force: true }); });

  function env(): NodeJS.ProcessEnv {
    return { VANTA_HOME: home, VANTA_TWITTER_QID_SEARCHTIMELINE: "QID", VANTA_ALLOW_PRIVATE_FETCH: "1" };
  }

  it("reports ok only after a live search probe succeeds", async () => {
    const pe = env();
    saveCookie("twitter", "auth_token=a; ct0=b", pe);
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: {} }) })));
    await expect(twitterChannel.check(pe)).resolves.toMatchObject({ status: "ok", detail: "live search probe passed" });
  });

  it("reports stale cached query ids as degraded after the live probe fails", async () => {
    const pe = env();
    saveCookie("twitter", "auth_token=a; ct0=b", pe);
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })));
    const status = await twitterChannel.check(pe);
    expect(status).toMatchObject({ status: "warn", fix: "reach heal twitter" });
    expect(status.detail).toContain("HTTP 404");
  });
});
