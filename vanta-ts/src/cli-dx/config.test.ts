import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  showConfig,
  migrateConfig,
  envPath,
  getConfig,
  setConfig,
  checkConfig,
  listConfigRevisions,
  formatRevisionList,
  rollbackConfig,
} from "./config.js";

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

// PCLIP-CONFIG-REVISION: every config write is versioned and `rollback` restores
// a prior revision. Vertical slice over setConfig/migrateConfig + the new rollback.
describe("config revisions + rollback", () => {
  let tmpDir: string;
  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "vanta-config-rev-test-"));
    await mkdir(join(tmpDir, "vanta-ts"), { recursive: true });
  });
  afterEach(async () => { await rm(tmpDir, { recursive: true, force: true }); });

  it("no revisions before any write; setConfig records one revision per write", async () => {
    expect(await listConfigRevisions(tmpDir)).toEqual([]);
    await setConfig(tmpDir, "VANTA_THEME", "dark");
    const afterFirst = await listConfigRevisions(tmpDir);
    expect(afterFirst).toHaveLength(1);
    expect(afterFirst[0]?.content).toBe(""); // snapshotted BEFORE the first write — .env was empty

    await setConfig(tmpDir, "VANTA_THEME", "light");
    const afterSecond = await listConfigRevisions(tmpDir);
    expect(afterSecond).toHaveLength(2);
    expect(afterSecond[0]?.content).toContain("VANTA_THEME=dark"); // newest-first; this is the pre-2nd-write state
  });

  it("rollback() with no arg undoes the last change", async () => {
    await setConfig(tmpDir, "VANTA_THEME", "dark");
    await setConfig(tmpDir, "VANTA_THEME", "light");
    expect(await getConfig(tmpDir, "VANTA_THEME")).toBe("VANTA_THEME=light");

    const msg = await rollbackConfig(tmpDir);
    expect(msg).toContain("restored .env to revision");
    expect(await getConfig(tmpDir, "VANTA_THEME")).toBe("VANTA_THEME=dark");
  });

  it("rollback(rev) restores a specific numbered revision", async () => {
    await setConfig(tmpDir, "VANTA_THEME", "dark"); // rev 1 = "" (empty .env)
    await setConfig(tmpDir, "VANTA_THEME", "light"); // rev 2 = "VANTA_THEME=dark"
    await setConfig(tmpDir, "VANTA_THEME", "auto"); // rev 3 = "VANTA_THEME=light"

    await rollbackConfig(tmpDir, 1); // back to the pre-first-write empty state
    expect(await getConfig(tmpDir, "VANTA_THEME")).toContain("unset");
  });

  it("a rollback is itself reversible (rolling back twice restores the more-recent state)", async () => {
    await setConfig(tmpDir, "VANTA_THEME", "dark");
    await setConfig(tmpDir, "VANTA_THEME", "light");
    await rollbackConfig(tmpDir); // → dark
    expect(await getConfig(tmpDir, "VANTA_THEME")).toBe("VANTA_THEME=dark");
    await rollbackConfig(tmpDir); // rollback recorded ITS OWN pre-state (light) → undo the rollback
    expect(await getConfig(tmpDir, "VANTA_THEME")).toBe("VANTA_THEME=light");
  });

  it("rollback with no history, or an unknown revision, reports cleanly (no throw)", async () => {
    expect(await rollbackConfig(tmpDir)).toContain("nothing to roll back to");
    await setConfig(tmpDir, "VANTA_THEME", "dark");
    expect(await rollbackConfig(tmpDir, 999)).toContain("not found");
  });

  it("migrateConfig also snapshots before rewriting (ARGO_* migration is undoable)", async () => {
    await writeFile(envPath(tmpDir), "ARGO_PROVIDER=openai\n");
    await migrateConfig(tmpDir);
    expect(await getConfig(tmpDir, "VANTA_PROVIDER")).toBe("VANTA_PROVIDER=openai");
    await rollbackConfig(tmpDir);
    expect(await readFile(envPath(tmpDir), "utf-8")).toBe("ARGO_PROVIDER=openai\n");
  });

  it("formatRevisionList renders a readable, chronological-newest-first listing", async () => {
    expect(formatRevisionList([])).toContain("No config revisions");
    await setConfig(tmpDir, "VANTA_THEME", "dark");
    const list = formatRevisionList(await listConfigRevisions(tmpDir));
    expect(list).toMatch(/rev 1/);
    expect(list).toContain("set VANTA_THEME");
  });
});
