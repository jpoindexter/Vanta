import { describe, it, expect, vi } from "vitest";
import { join } from "node:path";
import { acquirePage } from "./launch.js";

// acquirePage is the core wiring: it branches persistent vs ephemeral. We inject
// a fake chromium so the contract is locked WITHOUT a real browser binary.
// VANTA_BROWSER_PROFILE_ENABLED short-circuits usesPersistentProfile before any
// fs check, so these tests touch neither disk nor network.

type Chromium = typeof import("playwright-core").chromium;

function fakeChromium() {
  const persistentPage = { id: "persistent-existing" };
  const ephemeralPage = { id: "ephemeral-new" };
  const context = {
    pages: vi.fn(() => [persistentPage]),
    newPage: vi.fn(async () => ({ id: "persistent-new" })),
    close: vi.fn(async () => {}),
  };
  const browser = {
    newPage: vi.fn(async () => ephemeralPage),
    close: vi.fn(async () => {}),
  };
  const chromium = {
    launchPersistentContext: vi.fn(async () => context),
    launch: vi.fn(async () => browser),
  } as unknown as Chromium;
  return { chromium, context, browser, persistentPage, ephemeralPage };
}

describe("acquirePage — persistent branch", () => {
  it("launches a persistent context at the profile dir and reuses its open page", async () => {
    const { chromium, context, persistentPage } = fakeChromium();
    const env = {
      VANTA_HOME: "/tmp/fake-home",
      VANTA_BROWSER_PROFILE_ENABLED: "1",
    } as NodeJS.ProcessEnv;

    const { page, close } = await acquirePage(chromium, env, { headless: false });

    expect(chromium.launchPersistentContext).toHaveBeenCalledWith(
      join("/tmp/fake-home", "browser-profile"),
      { headless: false },
    );
    expect(chromium.launch).not.toHaveBeenCalled();
    expect(page).toBe(persistentPage); // reused, not a fresh newPage

    await close();
    expect(context.close).toHaveBeenCalledOnce();
  });

  it("opens a new page when the persistent context has none", async () => {
    const { chromium, context } = fakeChromium();
    context.pages.mockReturnValue([]);
    const env = {
      VANTA_HOME: "/tmp/fake-home",
      VANTA_BROWSER_PROFILE_ENABLED: "1",
    } as NodeJS.ProcessEnv;

    const { page } = await acquirePage(chromium, env);
    expect(context.newPage).toHaveBeenCalledOnce();
    expect((page as { id: string }).id).toBe("persistent-new");
  });
});

describe("acquirePage — ephemeral branch (default)", () => {
  it("launches a fresh browser and a new page when no profile is in play", async () => {
    const { chromium, browser, ephemeralPage } = fakeChromium();
    // Flag off + a home that does not exist → usesPersistentProfile is false.
    const env = { VANTA_HOME: "/tmp/does-not-exist-vanta-test" } as NodeJS.ProcessEnv;

    const { page, close } = await acquirePage(chromium, env);

    expect(chromium.launch).toHaveBeenCalledWith({ headless: true });
    expect(chromium.launchPersistentContext).not.toHaveBeenCalled();
    expect(page).toBe(ephemeralPage);

    await close();
    expect(browser.close).toHaveBeenCalledOnce();
  });
});
