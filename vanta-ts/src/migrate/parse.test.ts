import { describe, it, expect } from "vitest";
import { parseSourceSkill, parseMcpServers, parseModelConfig } from "./parse.js";

describe("parseSourceSkill", () => {
  it("parses a SKILL.md into a normalized skill", () => {
    const md = "---\nname: do-x\ndescription: how to x\ntags: [a]\n---\n\nStep one. Step two.";
    expect(parseSourceSkill(md, "fallback")).toEqual({ name: "do-x", description: "how to x", body: "Step one. Step two.", tags: ["a"] });
  });
  it("falls back to the dir slug for the name when frontmatter lacks one", () => {
    const md = "---\ndescription: d\n---\n\nbody here";
    expect(parseSourceSkill(md, "slug")?.name).toBe("slug");
  });
  it("returns null for an empty body", () => {
    expect(parseSourceSkill("---\nname: x\n---\n\n", "x")).toBeNull();
  });
});

describe("parseMcpServers", () => {
  it("reads the mcpServers key", () => {
    const servers = parseMcpServers(JSON.stringify({ mcpServers: { gh: { command: "npx" } } }));
    expect(Object.keys(servers)).toEqual(["gh"]);
  });
  it("merges servers (Vanta) over mcpServers (common)", () => {
    const servers = parseMcpServers(JSON.stringify({ mcpServers: { a: { command: "x" } }, servers: { b: { url: "http://y" } } }));
    expect(Object.keys(servers).sort()).toEqual(["a", "b"]);
  });
  it("tolerates bad JSON → {}", () => {
    expect(parseMcpServers("{ not json")).toEqual({});
  });
});

describe("parseModelConfig", () => {
  it("extracts provider/model and normalizes defaultModel", () => {
    expect(parseModelConfig(JSON.stringify({ provider: "openai", defaultModel: "gpt-4o" }))).toEqual({ provider: "openai", model: "gpt-4o" });
  });
  it("picks up a base url under several common keys", () => {
    expect(parseModelConfig(JSON.stringify({ provider: "x", baseURL: "http://z" })).apiBaseUrl).toBe("http://z");
  });
  it("tolerates bad JSON → {}", () => {
    expect(parseModelConfig("nope")).toEqual({});
  });
});
