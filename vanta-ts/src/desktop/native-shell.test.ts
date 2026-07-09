import { describe, expect, it } from "vitest";
import {
  DEFAULT_DESKTOP_PORT,
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

  it("accepts an explicit port and suppresses browser opening for child servers", () => {
    const plan = parseDesktopLaunchArgs(["7799", "--no-open"], {});
    expect(plan).toEqual({
      port: 7799,
      url: "http://127.0.0.1:7799",
      openBrowser: false,
    });
  });

  it("builds the CLI args the Electron app uses to own the server lifecycle", () => {
    const plan = parseNativeShellArgs(["7788", "--smoke"], { VANTA_NODE: "/usr/local/bin/node" });
    expect(plan.smoke).toBe(true);
    expect(plan.nodeBin).toBe("/usr/local/bin/node");
    expect(desktopServerArgs(plan)).toEqual(["--import", "tsx", "src/cli.ts", "desktop", "7788", "--no-open"]);
  });
});
