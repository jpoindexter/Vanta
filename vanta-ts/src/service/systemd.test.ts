import { describe, expect, it } from "vitest";
import { buildSystemdUnit } from "./systemd.js";

describe("buildSystemdUnit", () => {
  it("builds a bounded, user-owned restart unit with logs", () => {
    const unit = buildSystemdUnit({
      command: "/repo/run.sh",
      args: ["gateway"],
      workingDir: "/repo with space",
      logPath: "/home/user/.vanta/gateway.log",
    });
    expect(unit).toContain("# VANTA-MANAGED: studio.theft.vanta.gateway");
    expect(unit).toContain('ExecStart="/repo/run.sh" "gateway"');
    expect(unit).toContain("WorkingDirectory=/repo with space");
    expect(unit).toContain("Restart=on-failure");
    expect(unit).toContain("StartLimitBurst=5");
    expect(unit).toContain("StandardOutput=append:/home/user/.vanta/gateway.log");
  });

  it("escapes systemd specifiers", () => {
    expect(buildSystemdUnit({ command: "/repo/%i/run.sh", args: [], workingDir: "/repo", logPath: "/tmp/vanta.log" }))
      .toContain('ExecStart="/repo/%%i/run.sh"');
  });

  it("escapes assignment paths without wrapping them in literal quotes", () => {
    const unit = buildSystemdUnit({
      command: "/repo/run.sh",
      args: [],
      workingDir: "/repo/with space/%i",
      logPath: "/tmp/vanta logs/%n.log",
    });
    expect(unit).toContain("WorkingDirectory=/repo/with space/%%i");
    expect(unit).toContain("StandardOutput=append:/tmp/vanta logs/%%n.log");
    expect(unit).not.toContain('WorkingDirectory="');
  });
});
