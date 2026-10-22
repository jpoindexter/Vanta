import { describe, expect, it } from "vitest";
import { chooseDesktopLaunch, NEXT_APP_PATH } from "./desktop-next-launch.js";

const installed = () => true;
const missing = () => false;

describe("chooseDesktopLaunch", () => {
  it("opens the installed app for a bare `vanta desktop`", () => {
    expect(chooseDesktopLaunch([], {}, installed)).toEqual({ target: "next-app", appPath: NEXT_APP_PATH });
  });

  it("keeps the browser server when a port is given", () => {
    expect(chooseDesktopLaunch(["7790"], {}, installed)).toEqual({ target: "classic", args: ["7790"] });
  });

  it("keeps the browser server for --companion and --no-open", () => {
    expect(chooseDesktopLaunch(["--companion"], {}, installed)).toEqual({ target: "classic", args: ["--companion"] });
    expect(chooseDesktopLaunch(["--no-open"], {}, installed)).toEqual({ target: "classic", args: ["--no-open"] });
  });

  it("serves the old renderer for --classic and drops the flag from the args", () => {
    expect(chooseDesktopLaunch(["--classic"], {}, installed)).toEqual({ target: "classic", args: [] });
    expect(chooseDesktopLaunch(["3000", "--classic"], {}, installed)).toEqual({ target: "classic", args: ["3000"] });
  });

  it("serves the old renderer when VANTA_DESKTOP_CLASSIC=1", () => {
    expect(chooseDesktopLaunch([], { VANTA_DESKTOP_CLASSIC: "1" }, installed)).toEqual({ target: "classic", args: [] });
  });

  it("falls back to the old renderer when the app is not installed", () => {
    expect(chooseDesktopLaunch([], {}, missing)).toEqual({ target: "classic", args: [] });
  });

  it("honours VANTA_NEXT_APP_PATH and checks that path", () => {
    const seen: string[] = [];
    const choice = chooseDesktopLaunch([], { VANTA_NEXT_APP_PATH: "/tmp/Other.app" }, (path) => {
      seen.push(path);
      return true;
    });
    expect(choice).toEqual({ target: "next-app", appPath: "/tmp/Other.app" });
    expect(seen).toEqual(["/tmp/Other.app"]);
  });
});
