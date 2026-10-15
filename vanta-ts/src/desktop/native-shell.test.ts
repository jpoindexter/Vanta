import { describe, expect, it } from "vitest";
import {
  DEFAULT_DESKTOP_PORT,
  authenticatedDesktopUrl,
  desktopServerArgs,
  desktopUrl,
  parseDesktopLaunchArgs,
  parseNativeShellArgs,
} from "./native-shell.js";

describe("desktop native shell planning", () => {
  it("uses the default localhost desktop URL", () => {
    expect(desktopUrl(DEFAULT_DESKTOP_PORT)).toBe("http://127.0.0.1:7790");
    expect(parseDesktopLaunchArgs([], {}).url).toBe("http://127.0.0.1:7790");
  });

  it("places the high-entropy CLI boundary credential in a URL fragment", () => {
    expect(authenticatedDesktopUrl("http://127.0.0.1:7790", "launch-secret"))
      .toBe("http://127.0.0.1:7790/#boundary=launch-secret");
  });

  it("accepts an explicit port and suppresses browser opening for child servers", () => {
    const plan = parseDesktopLaunchArgs(["7799", "--no-open"], {});
    expect(plan).toEqual({
      port: 7799,
      url: "http://127.0.0.1:7799",
      openBrowser: false,
      companion: false,
      companionLocalOnly: false,
    });
  });

  it("--companion-local turns the companion on but keeps it to this machine, and passes through to the child server", () => {
    const plan = parseDesktopLaunchArgs(["7799", "--no-open", "--companion-local"], {});
    expect(plan.companion).toBe(true);
    expect(plan.companionLocalOnly).toBe(true);
    expect(desktopServerArgs(plan)).toEqual(["--import", "tsx", "src/cli.ts", "desktop", "7799", "--no-open", "--companion-local"]);
  });

  it("plain --companion stays LAN-wide, exactly as before", () => {
    const plan = parseDesktopLaunchArgs(["--companion"], {});
    expect(plan.companionLocalOnly).toBe(false);
    expect(desktopServerArgs(plan)).toContain("--companion");
  });

  it("builds the CLI args the Electron app uses to own the server lifecycle", () => {
    const plan = parseNativeShellArgs(["7788", "--smoke"], { VANTA_NODE: "/usr/local/bin/node" });
    expect(plan.smoke).toBe(true);
    expect(plan.nodeBin).toBe("/usr/local/bin/node");
    expect(plan.companion).toBe(true);
    expect(desktopServerArgs(plan)).toEqual(["--import", "tsx", "src/cli.ts", "desktop", "7788", "--no-open", "--companion"]);
  });
});
