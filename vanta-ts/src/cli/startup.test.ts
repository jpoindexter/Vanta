import { describe, it, expect } from "vitest";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { findRepoRoot, loadRestartSession, parseRunArgs } from "./startup.js";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { saveSession } from "../sessions/store.js";
import { writeRestartHandoff } from "../repl/restart-handoff.js";

describe("findRepoRoot", () => {
  it("honors the desktop shell's explicit project root", () => {
    expect(findRepoRoot({ VANTA_PROJECT_ROOT: tmpdir() })).toBe(resolve(tmpdir()));
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
