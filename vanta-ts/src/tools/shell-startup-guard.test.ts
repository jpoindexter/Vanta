import { describe, expect, it } from "vitest";
import { isShellStartupFile, shellStartupWarning } from "./shell-startup-guard.js";

describe("isShellStartupFile", () => {
  it("matches dotfile shell startup files in any directory", () => {
    for (const p of [
      "/Users/x/.zshenv",
      "~/.zshrc",
      "/home/u/.zprofile",
      "./.bash_profile",
      "/root/.bash_login",
      "/Users/x/proj/.bashrc",
      "/etc/skel/.profile",
    ]) {
      expect(isShellStartupFile(p)).toBe(true);
    }
  });

  it("matches fish config.fish in any directory", () => {
    expect(isShellStartupFile("~/.config/fish/config.fish")).toBe(true);
    expect(isShellStartupFile("/tmp/config.fish")).toBe(true);
  });

  it("matches bare system startup files", () => {
    expect(isShellStartupFile("/etc/profile")).toBe(true);
    expect(isShellStartupFile("/etc/zshenv")).toBe(true);
    expect(isShellStartupFile("/etc/bashrc")).toBe(true);
    expect(isShellStartupFile("/etc/zprofile")).toBe(true);
  });

  it("does NOT match normal source/doc files", () => {
    for (const p of [
      "src/foo.ts",
      "README.md",
      "notes.txt",
      "config.json",
      "/Users/x/index.tsx",
    ]) {
      expect(isShellStartupFile(p)).toBe(false);
    }
  });

  it("does NOT match unrelated dotfiles", () => {
    for (const p of [
      ".gitignore",
      "/repo/.gitignore",
      "~/.npmrc",
      ".env",
      "/x/.editorconfig",
    ]) {
      expect(isShellStartupFile(p)).toBe(false);
    }
  });

  it("is case-sensitive on the basename", () => {
    // an uppercase variant is not a real shell startup basename
    expect(isShellStartupFile("/Users/x/.ZSHRC")).toBe(false);
    expect(isShellStartupFile("/Users/x/Config.fish")).toBe(false);
  });
});

describe("shellStartupWarning", () => {
  it("names the path and the persistence risk", () => {
    const msg = shellStartupWarning("~/.zshrc");
    expect(msg).toContain("~/.zshrc");
    expect(msg.toLowerCase()).toContain("persistence");
    expect(msg.toLowerCase()).toContain("every new shell");
  });
});
