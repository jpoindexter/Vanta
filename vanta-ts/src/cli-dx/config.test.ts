import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { showConfig, migrateConfig, envPath } from "./config.js";

describe("config command", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "vanta-config-test-"));
    await mkdir(join(tmpDir, "vanta-ts"), { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("showConfig handles missing .env", async () => {
    // Should not throw, and output should indicate no config found.
    const captured: string[] = [];
    const originalLog = console.log;
    console.log = (...args) => captured.push(args.join(" "));
    try {
      await showConfig(tmpDir);
      expect(captured.some((s) => s.includes("No Vanta config found"))).toBe(true);
    } finally {
      console.log = originalLog;
    }
  });

  it("showConfig displays VANTA_* keys", async () => {
    const path = envPath(tmpDir);
    const envContent = `VANTA_PROVIDER=openai\nVANTA_MODEL=gpt-4o\n# comment\n`;
    await writeFile(path, envContent);

    const captured: string[] = [];
    const originalLog = console.log;
    console.log = (...args) => captured.push(args.join(" "));
    try {
      await showConfig(tmpDir);
      const output = captured.join("\n");
      expect(output).toContain("VANTA_PROVIDER");
      expect(output).toContain("openai");
    } finally {
      console.log = originalLog;
    }
  });

  it("showConfig redacts secret keys", async () => {
    const path = envPath(tmpDir);
    const envContent = `VANTA_PROVIDER=openai\nOPENAI_API_KEY=sk-secret123\n`;
    await writeFile(path, envContent);

    const captured: string[] = [];
    const originalLog = console.log;
    console.log = (...args) => captured.push(args.join(" "));
    try {
      await showConfig(tmpDir);
      const output = captured.join("\n");
      expect(output).toContain("[REDACTED]");
      expect(output).not.toContain("sk-secret123");
    } finally {
      console.log = originalLog;
    }
  });

  it("migrateConfig converts ARGO_* to VANTA_*", async () => {
    const path = envPath(tmpDir);
    const envContent = `ARGO_PROVIDER=openai\nARGO_MODEL=gpt-4\nVANTA_HOME=/home/user/.vanta\n`;
    await writeFile(path, envContent);

    await migrateConfig(tmpDir);

    const migrated = await readFile(path, "utf-8");
    expect(migrated).toContain("VANTA_PROVIDER=openai");
    expect(migrated).toContain("VANTA_MODEL=gpt-4");
    expect(migrated).not.toContain("ARGO_PROVIDER");
    expect(migrated).not.toContain("ARGO_MODEL");
    expect(migrated).toContain("VANTA_HOME=/home/user/.vanta");
  });

  it("migrateConfig handles missing .env", async () => {
    const captured: string[] = [];
    const originalLog = console.log;
    console.log = (...args) => captured.push(args.join(" "));
    try {
      await migrateConfig(tmpDir);
      expect(captured.some((s) => s.includes("No .env file found"))).toBe(true);
    } finally {
      console.log = originalLog;
    }
  });

  it("migrateConfig reports when already migrated", async () => {
    const path = envPath(tmpDir);
    const envContent = `VANTA_PROVIDER=openai\nVANTA_MODEL=gpt-4\n`;
    await writeFile(path, envContent);

    const captured: string[] = [];
    const originalLog = console.log;
    console.log = (...args) => captured.push(args.join(" "));
    try {
      await migrateConfig(tmpDir);
      const output = captured.join("\n");
      expect(output).toContain("Already migrated");
    } finally {
      console.log = originalLog;
    }
  });
});
