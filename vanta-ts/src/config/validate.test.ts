import { describe, it, expect } from "vitest";
import { describeConfigError, validateConfigFiles, type ReadConfigFile } from "./validate.js";

// A reader backed by an in-memory map — no real fs, so these stay pure.
function fakeReader(files: Record<string, string>): ReadConfigFile {
  return async (path) => files[path] ?? null;
}

const MALFORMED_MULTILINE = `{
  "servers": {
    "x": { "command": "echo" },
  }
}`; // trailing comma on line 3 → positional error

describe("describeConfigError", () => {
  it("names the file, the line, and an actionable instruction", () => {
    let err: unknown;
    try {
      JSON.parse(MALFORMED_MULTILINE);
    } catch (e) {
      err = e;
    }
    const msg = describeConfigError("~/.vanta/mcp.json", MALFORMED_MULTILINE, err);
    expect(msg).toContain("~/.vanta/mcp.json");
    expect(msg).toContain("line 4"); // trailing comma flags at the next token
    expect(msg).toContain("invalid JSON");
    expect(msg).toContain("fix it or remove it");
    // the noisy " in JSON at position ..." tail is stripped
    expect(msg).not.toContain("in JSON at position");
  });

  it("omits the line when the parser gives no position (non-positional error)", () => {
    let err: unknown;
    try {
      JSON.parse("not json");
    } catch (e) {
      err = e;
    }
    const msg = describeConfigError(".mcp.json", "not json", err);
    expect(msg).toContain(".mcp.json");
    expect(msg).toContain("invalid JSON");
    expect(msg).not.toContain("at line");
    expect(msg).toContain("fix it or remove it");
  });
});

describe("validateConfigFiles", () => {
  const env: NodeJS.ProcessEnv = { VANTA_HOME: "/home/.vanta" };
  const cwd = "/proj";

  it("returns a notice naming the file and a line number for malformed JSON", async () => {
    const read = fakeReader({ "/proj/.mcp.json": MALFORMED_MULTILINE });
    const notices = await validateConfigFiles(env, { cwd, read });
    expect(notices).toHaveLength(1);
    expect(notices[0]).toContain(".mcp.json");
    expect(notices[0]).toContain("line 4");
  });

  it("returns nothing when every config file is valid JSON", async () => {
    const read = fakeReader({
      "/proj/.mcp.json": '{ "servers": {} }',
      "/home/.vanta/settings.json": '{ "allowedTools": ["read_file"] }',
    });
    expect(await validateConfigFiles(env, { cwd, read })).toEqual([]);
  });

  it("returns nothing when no config files exist (absent → skipped)", async () => {
    const read = fakeReader({});
    expect(await validateConfigFiles(env, { cwd, read })).toEqual([]);
  });

  it("treats an empty / whitespace-only file as absent (no notice)", async () => {
    const read = fakeReader({ "/proj/.mcp.json": "   \n  " });
    expect(await validateConfigFiles(env, { cwd, read })).toEqual([]);
  });

  it("reports one notice per broken file across mcp + settings scopes", async () => {
    const read = fakeReader({
      "/proj/.mcp.json": "{bad",
      "/home/.vanta/settings.json": "{also bad",
    });
    const notices = await validateConfigFiles(env, { cwd, read });
    expect(notices).toHaveLength(2);
    expect(notices.some((n) => n.includes(".mcp.json"))).toBe(true);
    expect(notices.some((n) => n.includes("settings.json"))).toBe(true);
  });

  it("never throws when the reader itself rejects — the file is skipped", async () => {
    const read: ReadConfigFile = async () => {
      throw new Error("EACCES");
    };
    await expect(validateConfigFiles(env, { cwd, read })).resolves.toEqual([]);
  });
});
