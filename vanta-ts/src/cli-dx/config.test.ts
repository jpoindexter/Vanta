import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { showConfig, migrateConfig, envPath, getConfig, setConfig, checkConfig } from "./config.js";

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

  it("setConfig + getConfig round-trip a normal setting", async () => {
    expect(await setConfig(tmpDir, "VANTA_THEME", "dark")).toContain("VANTA_THEME=dark");
    expect(await getConfig(tmpDir, "VANTA_THEME")).toBe("VANTA_THEME=dark");
  });

  it("setConfig stores a secret but never echoes it; getConfig masks it", async () => {
    const msg = await setConfig(tmpDir, "OPENAI_API_KEY", "sk-secret");
    expect(msg).not.toContain("sk-secret");
    expect(msg).toContain("hidden");
    expect(await getConfig(tmpDir, "OPENAI_API_KEY")).toBe("OPENAI_API_KEY=[REDACTED]");
    expect(await readFile(envPath(tmpDir), "utf-8")).toContain("OPENAI_API_KEY=sk-secret"); // really stored
  });

  it("setConfig rejects a malformed key; getConfig reports unset", async () => {
    expect(await setConfig(tmpDir, "bad key", "x")).toContain("invalid key");
    expect(await getConfig(tmpDir, "VANTA_NOPE")).toContain("unset");
  });

  it("checkConfig reports no .env, missing provider, missing key, then passes", async () => {
    expect(await checkConfig(tmpDir)).toContain("no .env"); // nothing written yet
    await writeFile(envPath(tmpDir), "VANTA_MODEL=x\n"); // .env exists but no provider
    expect(await checkConfig(tmpDir)).toContain("VANTA_PROVIDER not set");
    await writeFile(envPath(tmpDir), "VANTA_PROVIDER=openai\n");
    expect(await checkConfig(tmpDir)).toContain("OPENAI_API_KEY");
    await writeFile(envPath(tmpDir), "VANTA_PROVIDER=openai\nOPENAI_API_KEY=sk-x\n");
    expect(await checkConfig(tmpDir)).toContain("valid");
  });
});
