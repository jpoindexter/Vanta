import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureVantaStore } from "./home.js";

// ensureVantaStore creates the home dirs, git-inits for free versioning, and
// writes a .gitignore so the home's secret files can never be committed. All
// tests point VANTA_HOME at a fresh temp dir, so the real ~/.vanta is untouched
// and the legacy-migration branch (VANTA_HOME-unset only) never runs.

const SECRET_ENTRIES = [
  "google-tokens.json",
  "mcp-auth-tokens.json",
  "cookies/",
  "*.cookie",
  "*-qids.json",
  "*.key",
  "*-tokens.json",
  ".env",
  ".env.*",
];

describe("ensureVantaStore .gitignore", () => {
  let env: NodeJS.ProcessEnv;
  beforeEach(() => {
    env = { VANTA_HOME: mkdtempSync(join(tmpdir(), "vanta-home-")) };
  });

  it("writes a .gitignore listing the secret files", async () => {
    const home = await ensureVantaStore(env);
    const path = join(home, ".gitignore");
    expect(existsSync(path)).toBe(true);
    const body = readFileSync(path, "utf8");
    for (const entry of SECRET_ENTRIES) {
      expect(body).toContain(entry);
    }
  });

  it("does not overwrite a pre-existing .gitignore", async () => {
    const home = env.VANTA_HOME as string;
    const path = join(home, ".gitignore");
    writeFileSync(path, "custom-entry\n", "utf8");
    await ensureVantaStore(env);
    expect(readFileSync(path, "utf8")).toBe("custom-entry\n");
  });

  it("is idempotent across repeated calls", async () => {
    const home = await ensureVantaStore(env);
    const path = join(home, ".gitignore");
    const first = readFileSync(path, "utf8");
    await ensureVantaStore(env);
    expect(readFileSync(path, "utf8")).toBe(first);
  });
});
