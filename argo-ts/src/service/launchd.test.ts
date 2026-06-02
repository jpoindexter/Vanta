import { describe, it, expect } from "vitest";
import { buildLaunchdPlist } from "./launchd.js";

describe("buildLaunchdPlist", () => {
  const base = {
    label: "studio.theft.argo.gateway",
    programArgs: ["/repo/run.sh", "gateway"],
    workingDir: "/repo",
    logPath: "/home/.argo/gateway.log",
  };

  it("produces a valid plist with the label, args, and keep-alive", () => {
    const plist = buildLaunchdPlist(base);
    expect(plist).toContain("<plist version=\"1.0\">");
    expect(plist).toContain("<string>studio.theft.argo.gateway</string>");
    expect(plist).toContain("<string>/repo/run.sh</string>");
    expect(plist).toContain("<string>gateway</string>");
    expect(plist).toContain("<key>RunAtLoad</key>\n    <true/>");
    expect(plist).toContain("<key>KeepAlive</key>\n    <true/>");
    expect(plist).toContain("<string>/home/.argo/gateway.log</string>");
  });

  it("includes a PATH environment block when pathDirs are given", () => {
    const plist = buildLaunchdPlist({ ...base, pathDirs: ["/usr/local/bin", "/usr/bin"] });
    expect(plist).toContain("<key>EnvironmentVariables</key>");
    expect(plist).toContain("<string>/usr/local/bin:/usr/bin</string>");
  });

  it("omits the env block when no pathDirs", () => {
    expect(buildLaunchdPlist(base)).not.toContain("EnvironmentVariables");
  });

  it("escapes XML metacharacters in paths", () => {
    const plist = buildLaunchdPlist({ ...base, workingDir: "/a&b/<c>" });
    expect(plist).toContain("/a&amp;b/&lt;c&gt;");
  });
});
