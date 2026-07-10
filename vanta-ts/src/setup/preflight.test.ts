import { describe, it, expect } from "vitest";
import {
  PREFLIGHT_TOOLS,
  detectPlatform,
  installCommand,
  runPreflight,
  formatPreflight,
  commandExists,
  type ToolSpec,
} from "./preflight.js";

const node: ToolSpec = { name: "Node.js 22+", cmd: "node", required: true, purpose: "the agent runtime", brew: "node", url: "https://nodejs.org" };
const rust: ToolSpec = { name: "Rust (cargo)", cmd: "cargo", required: true, purpose: "the safety kernel", url: "https://rustup.rs" };
const rg: ToolSpec = { name: "ripgrep", cmd: "rg", required: false, purpose: "fast code search", brew: "ripgrep", apt: "ripgrep" };

describe("detectPlatform", () => {
  it("maps node platforms to install targets", () => {
    expect(detectPlatform("darwin")).toBe("macos");
    expect(detectPlatform("linux")).toBe("linux");
    expect(detectPlatform("linux", { TERMUX_VERSION: "0.118" })).toBe("termux");
    expect(detectPlatform("linux", { PREFIX: "/data/data/com.termux/files/usr" })).toBe("termux");
    expect(detectPlatform("win32")).toBe("other");
  });
});

describe("installCommand", () => {
  it("prefers brew on macOS, apt on linux", () => {
    expect(installCommand(rg, "macos")).toBe("brew install ripgrep");
    expect(installCommand(rg, "linux")).toBe("sudo apt-get install -y ripgrep");
  });
  it("falls back to the manual URL when no package exists for the platform", () => {
    expect(installCommand(rust, "linux")).toBe("https://rustup.rs"); // no apt
    expect(installCommand(rust, "macos")).toBe("https://rustup.rs"); // no brew
  });
  it("uses native Termux package commands without suggesting Homebrew", () => {
    expect(installCommand({ ...node, termux: "nodejs-lts" }, "termux")).toBe("pkg install -y nodejs-lts");
    expect(installCommand(rg, "termux")).toBeNull();
  });
  it("uses the URL on 'other' platforms, then brew as a last resort", () => {
    expect(installCommand(node, "other")).toBe("https://nodejs.org");
    expect(installCommand(rg, "other")).toBe("brew install ripgrep"); // no url, has brew
  });
  it("returns null when there is no install path at all", () => {
    expect(installCommand({ name: "x", cmd: "x", required: false, purpose: "" }, "macos")).toBeNull();
  });
});

describe("runPreflight", () => {
  it("partitions present / missing-required / missing-recommended", () => {
    const tools = [node, rust, rg];
    const has = (c: string) => c === "node"; // only node present
    const res = runPreflight(has, tools);
    expect(res.ok).toBe(false); // cargo missing
    expect(res.present).toEqual(["node"]);
    expect(res.missingRequired.map((t) => t.cmd)).toEqual(["cargo"]);
    expect(res.missingRecommended.map((t) => t.cmd)).toEqual(["rg"]);
  });
  it("is ok when all required tools are present", () => {
    const res = runPreflight((c) => c === "node" || c === "cargo", [node, rust, rg]);
    expect(res.ok).toBe(true);
    expect(res.missingRequired).toHaveLength(0);
    expect(res.missingRecommended.map((t) => t.cmd)).toEqual(["rg"]);
  });
  it("omits platform-specific tools outside their platform", () => {
    const macOnly: ToolSpec = { name: "cliclick", cmd: "cliclick", required: false, purpose: "desktop", platforms: ["macos"] };
    expect(runPreflight(() => false, [node, macOnly], "termux").missingRecommended).toEqual([]);
  });
});

describe("formatPreflight", () => {
  it("shows missing required tools with their fix command", () => {
    const res = runPreflight((c) => c === "node", [node, rust, rg]);
    const out = formatPreflight(res, "macos");
    expect(out).toContain("Missing required tools");
    expect(out).toContain("Rust (cargo)");
    expect(out).toContain("https://rustup.rs");
    expect(out).toContain("brew install ripgrep"); // recommended section
  });
  it("reports all-clear when nothing required is missing", () => {
    const res = runPreflight(() => true, [node, rust]);
    expect(formatPreflight(res, "linux")).toContain("All required tools present");
  });
});

describe("commandExists", () => {
  it("finds a tool that is definitely on PATH", () => {
    expect(commandExists("sh")).toBe(true);
  });
  it("returns false for a tool that does not exist", () => {
    expect(commandExists("definitely-not-a-real-binary-xyz")).toBe(false);
  });
  it("rejects shell-injection in the probe arg", () => {
    expect(commandExists("sh; rm -rf /")).toBe(false);
    expect(commandExists("$(touch /tmp/pwned)")).toBe(false);
  });
});

describe("PREFLIGHT_TOOLS", () => {
  it("lists the three hard requirements", () => {
    const required = PREFLIGHT_TOOLS.filter((t) => t.required).map((t) => t.cmd);
    expect(required).toEqual(["node", "cargo", "git"]);
  });
  it("gives every tool an install path on at least one platform", () => {
    for (const t of PREFLIGHT_TOOLS) {
      const any =
        installCommand(t, "macos") || installCommand(t, "linux") || installCommand(t, "other");
      expect(any, `${t.cmd} has no install path`).toBeTruthy();
    }
  });
});
