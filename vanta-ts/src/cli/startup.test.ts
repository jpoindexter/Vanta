import { describe, it, expect } from "vitest";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { findRepoRoot, loadEnv, loadRestartSession, parseRunArgs } from "./startup.js";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { saveSession } from "../sessions/store.js";
import { writeRestartHandoff } from "../repl/restart-handoff.js";

describe("findRepoRoot", () => {
  it("honors the desktop shell's explicit project root", () => {
    expect(findRepoRoot({ VANTA_PROJECT_ROOT: tmpdir() })).toBe(resolve(tmpdir()));
  });
});

describe("loadEnv — returning installation configuration", () => {
  it("falls back to the persistent Vanta home when a new worktree has no local provider config", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-startup-config-"));
    const home = join(root, "home");
    await mkdir(home, { recursive: true });
    await writeFile(join(home, ".env"), "VANTA_PROVIDER=claude-code\nVANTA_MODEL=claude-sonnet-4-5\n", "utf8");
    const previous = {
      home: process.env.VANTA_HOME,
      provider: process.env.VANTA_PROVIDER,
      model: process.env.VANTA_MODEL,
    };
    process.env.VANTA_HOME = home;
    delete process.env.VANTA_PROVIDER;
    delete process.env.VANTA_MODEL;
    try {
      loadEnv(root);
      expect(process.env.VANTA_PROVIDER).toBe("claude-code");
      expect(process.env.VANTA_MODEL).toBe("claude-sonnet-4-5");
    } finally {
      previous.home === undefined ? delete process.env.VANTA_HOME : process.env.VANTA_HOME = previous.home;
      previous.provider === undefined ? delete process.env.VANTA_PROVIDER : process.env.VANTA_PROVIDER = previous.provider;
      previous.model === undefined ? delete process.env.VANTA_MODEL : process.env.VANTA_MODEL = previous.model;
    }
  });

  it("keeps a worktree provider choice ahead of the persistent fallback", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-startup-precedence-"));
    const home = join(root, "home");
    await mkdir(join(root, "vanta-ts"), { recursive: true });
    await mkdir(home, { recursive: true });
    await writeFile(join(root, "vanta-ts", ".env"), "VANTA_PROVIDER=codex\nVANTA_MODEL=gpt-5.6-sol\n", "utf8");
    await writeFile(join(home, ".env"), "VANTA_PROVIDER=claude-code\nVANTA_MODEL=claude-sonnet-4-5\n", "utf8");
    const previous = {
      home: process.env.VANTA_HOME,
      provider: process.env.VANTA_PROVIDER,
      model: process.env.VANTA_MODEL,
    };
    process.env.VANTA_HOME = home;
    delete process.env.VANTA_PROVIDER;
    delete process.env.VANTA_MODEL;
    try {
      loadEnv(root);
      expect(process.env.VANTA_PROVIDER).toBe("codex");
      expect(process.env.VANTA_MODEL).toBe("gpt-5.6-sol");
    } finally {
      previous.home === undefined ? delete process.env.VANTA_HOME : process.env.VANTA_HOME = previous.home;
      previous.provider === undefined ? delete process.env.VANTA_PROVIDER : process.env.VANTA_PROVIDER = previous.provider;
      previous.model === undefined ? delete process.env.VANTA_MODEL : process.env.VANTA_MODEL = previous.model;
    }
  });
});

describe("parseRunArgs", () => {
  it("preserves a flagless instruction (regression: index-0 was being dropped)", () => {
    expect(parseRunArgs(["what is 2+2?"])).toEqual({ instruction: "what is 2+2?", outputFormat: "text", jsonSchema: undefined });
  });

  it("preserves a multi-word flagless instruction (run.sh passes it as one arg)", () => {
    expect(parseRunArgs(["ask claude to reply READY"]).instruction).toBe("ask claude to reply READY");
  });

  it("joins multiple instruction args", () => {
    expect(parseRunArgs(["do", "the", "thing"]).instruction).toBe("do the thing");
  });

  it("strips --output-format + its value, keeps the instruction", () => {
    const r = parseRunArgs(["summarize the diff", "--output-format", "json"]);
    expect(r.instruction).toBe("summarize the diff");
    expect(r.outputFormat).toBe("json");
  });

  it("strips --json-schema + its value, keeps the instruction", () => {
    const r = parseRunArgs(["extract fields", "--json-schema", "/tmp/s.json"]);
    expect(r.instruction).toBe("extract fields");
    expect(r.jsonSchema).toBe("/tmp/s.json");
  });

  it("handles a flag before the instruction without eating instruction words", () => {
    const r = parseRunArgs(["--output-format", "text", "hello world"]);
    expect(r.instruction).toBe("hello world");
    expect(r.outputFormat).toBe("text");
  });
});

describe("reload continuity", () => {
  it("consumes the handoff and loads the saved conversation", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-startup-reload-"));
    const env = { VANTA_HOME: join(root, "home") } as NodeJS.ProcessEnv;
    const now = new Date("2026-07-29T10:00:00.000Z");
    await saveSession("reload-me", [{ role: "user", content: "run the jobs again" }], { env, started: now.toISOString() });
    await writeRestartHandoff(join(root, ".vanta"), "reload-me", now);

    const session = await loadRestartSession(root, env, now);
    expect(session?.id).toBe("reload-me");
    expect(session?.messages.at(-1)?.content).toBe("run the jobs again");
    await expect(loadRestartSession(root, env, now)).resolves.toBeNull();
  });
});
