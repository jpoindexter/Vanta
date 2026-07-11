import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runSecretsCommand } from "./secrets-vault-cmd.js";

let home = "";
afterEach(async () => { if (home) await rm(home, { recursive: true, force: true }); });

describe("vanta secrets vault", () => {
  it("adds, reports, resolves, and confirms reference rotation without printing values", async () => {
    home = await mkdtemp(join(tmpdir(), "vanta-secrets-cli-"));
    const lines: string[] = [];
    const exec = vi.fn(async () => "never-print-this-value");
    const deps = { env: { VANTA_HOME: home, BW_SESSION: "token" }, exec, log: (line: string) => lines.push(line), now: () => new Date("2026-07-11T12:00:00.000Z") };
    expect(await runSecretsCommand(["vault", "add", "OPENAI_API_KEY", "--backend", "bitwarden", "--ref", "old-item", "--scope", "profile:research"], deps)).toBe(0);
    expect(await runSecretsCommand(["vault", "status"], deps)).toBe(0);
    expect(await runSecretsCommand(["vault", "resolve", "OPENAI_API_KEY", "--scope", "profile:research"], deps)).toBe(0);
    expect(await runSecretsCommand(["vault", "rotate", "OPENAI_API_KEY", "--to-ref", "new-item"], deps)).toBe(2);
    expect(await runSecretsCommand(["vault", "rotate", "OPENAI_API_KEY", "--to-ref", "new-item", "--yes"], deps)).toBe(0);
    const output = lines.join("\n");
    expect(output).toContain("bootstrap present");
    expect(output).toContain("resolved OPENAI_API_KEY");
    expect(output).toContain("rerun with --yes");
    expect(output).toContain("rotated OPENAI_API_KEY");
    expect(output).not.toContain("never-print-this-value");
    expect(output).not.toContain("token");
  });

  it("registers a macOS Keychain service reference", async () => {
    home = await mkdtemp(join(tmpdir(), "vanta-secrets-cli-"));
    const lines: string[] = [], deps = { env: { VANTA_HOME: home, VANTA_KEYCHAIN: "1" }, log: (line: string) => lines.push(line) };
    expect(await runSecretsCommand(["vault", "add", "DATABASE_URL", "--backend", "keychain", "--ref", "vanta-project-db", "--scope", "payment:stripe-projects"], deps)).toBe(0);
    expect(lines.join("\n")).toContain("DATABASE_URL · keychain");
    expect(lines.join("\n")).not.toContain("postgres://");
  });
});
