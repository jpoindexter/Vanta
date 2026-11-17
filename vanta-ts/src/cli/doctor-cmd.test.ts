import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runDoctorCommand } from "./doctor-cmd.js";

afterEach(() => vi.unstubAllEnvs());

describe("runDoctorCommand", () => {
  it("prints health, a read-only context report, and the semantic follow-up", async () => {
    const status = vi.fn(async () => {});
    const context = vi.fn(async () => "=== Harness Thickness Audit ===");
    const lines: string[] = [];

    expect(
      await runDoctorCommand("/repo", ["--limit", "3"], {
        status,
        context,
        log: (line) => lines.push(line),
      }),
    ).toBe(0);

    expect(status).toHaveBeenCalledWith(["--limit", "3"]);
    expect(context).toHaveBeenCalledWith("/repo", 3);
    expect(lines.join("\n")).toContain("Harness Thickness Audit");
    expect(lines.join("\n")).toContain("vanta skill context-doctor");
  });

  it("checks fallback configuration without running health or context checks", async () => {
    vi.stubEnv("VANTA_HOME", await mkdtemp(join(tmpdir(), "vanta-doctor-fallbacks-")));
    vi.stubEnv("VANTA_FALLBACK_PROVIDERS", "ollama");
    const status = vi.fn(async () => {});
    const context = vi.fn(async () => "must not run");
    const lines: string[] = [];

    expect(await runDoctorCommand("/repo", ["--fallbacks"], {
      status, context, log: line => lines.push(line),
    })).toBe(0);

    expect(status).not.toHaveBeenCalled();
    expect(context).not.toHaveBeenCalled();
    expect(lines.join("\n")).toContain("ollama: configuration-resolved");
    expect(lines.join("\n")).toContain("static only");
    expect(lines.join("\n")).not.toContain("context-doctor");
  });

  it.each(["unknown-provider", "codex", "claude-code"])("does not report %s as ready", async provider => {
    vi.stubEnv("VANTA_HOME", await mkdtemp(join(tmpdir(), "vanta-doctor-fallbacks-")));
    vi.stubEnv("VANTA_FALLBACK_PROVIDERS", provider);
    vi.stubEnv("CLAUDE_CODE_OAUTH_TOKEN", "");
    vi.stubEnv("ANTHROPIC_AUTH_TOKEN", "");
    const status = vi.fn(async () => {});
    const context = vi.fn(async () => "must not run");
    const lines: string[] = [];

    expect(await runDoctorCommand("/repo", ["--fallbacks"], {
      status, context, log: line => lines.push(line),
    })).toBe(1);

    expect(status).not.toHaveBeenCalled();
    expect(context).not.toHaveBeenCalled();
    expect(lines.join("\n")).toContain(provider === "unknown-provider" ? "vanta setup" : "not-checked");
    expect(lines.join("\n")).not.toContain("configuration-resolved");
  });

  it("reports an unconfigured fallback chain without running unrelated checks", async () => {
    vi.stubEnv("VANTA_HOME", await mkdtemp(join(tmpdir(), "vanta-doctor-fallbacks-")));
    vi.stubEnv("VANTA_FALLBACK_PROVIDERS", " , ");
    const status = vi.fn(async () => {});
    const context = vi.fn(async () => "must not run");
    const lines: string[] = [];
    expect(await runDoctorCommand("/repo", ["--fallbacks"], { status, context, log: line => lines.push(line) })).toBe(0);
    expect(lines.join("\n")).toContain("No fallback entries configured; primary route unchanged");
    expect(status).not.toHaveBeenCalled();
    expect(context).not.toHaveBeenCalled();
  });
});
