import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { importHermesYaml } from "./hermes-config.js";

const fixtureText = readFileSync(fileURLToPath(new URL("./__fixtures__/hermes-yaml/config.yaml", import.meta.url)), "utf8");
const result = importHermesYaml(fixtureText);
const reasonFor = (item: string): string | undefined => result.skipped.find((s) => s.item === item)?.reason;

describe("importHermesYaml — fixture config.yaml", () => {
  it("imports servers with a command or url and maps block and flow lists", () => {
    expect(Object.keys(result.mcp).sort()).toEqual(["filesystem", "github", "globby", "linear", "remote_api"]);
    expect(result.mcp.filesystem).toEqual({ command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem", "/home/user/projects"] });
    expect(result.mcp.github?.args).toEqual(["-y", "@modelcontextprotocol/server-github"]);
    expect(result.mcp.remote_api?.url).toBe("https://mcp.example.test/mcp");
  });

  it("maps whole-value env references to Vanta references and keeps plain env", () => {
    expect(result.mcp.github?.env).toMatchObject({ GITHUB_PERSONAL_ACCESS_TOKEN: "${GITHUB_TOKEN}", LOG_LEVEL: "info" });
  });

  it("never copies a literal credential from env or headers", () => {
    expect(result.mcp.github?.env?.SLACK_BOT_TOKEN).toBe("${SLACK_BOT_TOKEN}");
    expect(reasonFor("mcp_servers.github.env.SLACK_BOT_TOKEN")).toContain("literal secret not copied");
    expect(result.mcp.remote_api?.headers).toEqual({ "X-Team": "acme", "X-Org": "${ORG_ID}" });
    expect(reasonFor("mcp_servers.remote_api.headers.Authorization")).toContain("not copied");
    expect(JSON.stringify(result)).not.toMatch(/literal-value-in-file|not-a-real-token|not-a-real-key/);
  });

  it("maps a plain tools.include allowlist and reports the rest", () => {
    expect(result.mcp.github?.tools).toEqual(["list_issues", "get_issue"]);
    expect(reasonFor("mcp_servers.github.tools.exclude")).toContain("no Vanta equivalent");
    expect(reasonFor("mcp_servers.github.tools.resources")).toContain("no Vanta equivalent");
    expect(result.mcp.globby?.tools).toBeUndefined();
    expect(reasonFor("mcp_servers.globby.tools.include")).toContain("glob");
  });

  it("reports fields with no Vanta equivalent instead of importing them", () => {
    expect(reasonFor("mcp_servers.filesystem.timeout")).toContain("no Vanta equivalent");
    expect(reasonFor("mcp_servers.filesystem.connect_timeout")).toBeDefined();
    expect(reasonFor("mcp_servers.remote_api.ssl_verify")).toBeDefined();
    expect(reasonFor("mcp_servers.linear.auth")).toContain("never copied");
    expect(result.mcp.linear).toEqual({ url: "https://mcp.linear.test/mcp" });
  });

  it("skips disabled, unresolvable and unsupported-YAML servers with a reason", () => {
    expect(result.mcp.paused).toBeUndefined();
    expect(reasonFor("mcp_servers.paused.enabled")).toContain("disabled");
    expect(result.mcp.needs_workspace).toBeUndefined();
    expect(reasonFor("mcp_servers.needs_workspace.(launch)")).toContain("server skipped");
    expect(result.mcp.exotic).toBeUndefined();
    expect(reasonFor("mcp_servers.exotic")).toMatch(/unsupported YAML.*line \d+/);
    expect(result.mcp.anchored).toBeUndefined();
    expect(reasonFor("mcp_servers.anchored")).toContain("unsupported YAML");
  });

  it("maps the default model when the provider has a Vanta equivalent, and reports base_url and api_key", () => {
    expect(result.model).toEqual({ provider: "anthropic", model: "claude-opus-4.6" });
    expect(reasonFor("model.base_url")).toBeDefined();
    expect(reasonFor("model.api_key")).toContain("never copied");
    expect(result.sections).toEqual({ mcp: true, model: true });
  });

  it("does not read unrelated sections that use syntax the reader refuses", () => {
    expect(result.skipped.some((s) => /agent|display|database/.test(s.item))).toBe(false);
  });
});

describe("importHermesYaml — edge cases", () => {
  it("does not set a model when the provider is auto or unknown, and says so", () => {
    for (const provider of ["auto", "somewhere-else", ""]) {
      const out = importHermesYaml(`model:\n  default: "gpt-x"\n  provider: "${provider}"\n`);
      expect(out.model).toBeNull();
      expect(out.skipped.find((s) => s.item === "model.default")?.reason).toContain("no safe Vanta equivalent");
    }
  });

  it("treats a bare model name as unmappable and accepts the `model:` key as well as `default:`", () => {
    expect(importHermesYaml("model: gpt-5\n").model).toBeNull();
    expect(importHermesYaml("model:\n  model: gpt-5\n  provider: openai\n").model).toEqual({ provider: "openai", model: "gpt-5" });
  });

  it("maps provider aliases and lower-cases the provider id", () => {
    expect(importHermesYaml("model:\n  default: m\n  provider: OpenAI-Codex\n").model?.provider).toBe("codex");
  });

  it("returns nothing for a file with neither section, and for empty input", () => {
    expect(importHermesYaml("display:\n  theme: dark\n")).toMatchObject({ mcp: {}, model: null, skipped: [], sections: { mcp: false, model: false } });
    expect(importHermesYaml("").mcp).toEqual({});
  });

  it("drops a credential-shaped value even when the variable name looks harmless", () => {
    const pat = `ghp_${"a1B2".repeat(9)}`;
    const out = importHermesYaml(`mcp_servers:\n  s:\n    command: node\n    env:\n      NOTE: "${pat}"\n`);
    expect(JSON.stringify(out)).not.toContain(pat);
    expect(out.mcp.s?.env?.NOTE).toBe("${NOTE}");
  });

  it("skips a server whose launch line carries a credential", () => {
    const pat = `ghp_${"a1B2".repeat(9)}`;
    const out = importHermesYaml(`mcp_servers:\n  s:\n    command: node\n    args: ["--token", "${pat}"]\n`);
    expect(out.mcp.s).toBeUndefined();
    expect(JSON.stringify(out)).not.toContain(pat);
  });

  it("keeps header references Vanta resolves and drops ones it cannot", () => {
    const out = importHermesYaml('mcp_servers:\n  a:\n    url: "https://x.test/mcp"\n    headers:\n      Authorization: "Bearer ${env:A_TOKEN}"\n      X-Ctx: "${workspaceFolder}"\n');
    expect(out.mcp.a?.headers).toEqual({ Authorization: "Bearer ${A_TOKEN}" });
    expect(out.skipped.map((s) => s.item)).toEqual(["mcp_servers.a.headers.X-Ctx"]);
  });

  it("refuses non-http urls and url credentials", () => {
    const out = importHermesYaml('mcp_servers:\n  a:\n    url: "file:///etc/passwd"\n  b:\n    url: "https://x.test/mcp?token=abc123"\n');
    expect(out.mcp).toEqual({});
    expect(out.skipped.length).toBe(2);
  });

  it("reports tab-indented entries instead of misreading them", () => {
    const out = importHermesYaml("mcp_servers:\n  a:\n\tcommand: node\n");
    expect(out.mcp.a).toBeUndefined();
    expect(out.skipped[0]?.reason).toContain("unsupported YAML");
  });

  it("keeps a quoted comment character and ignores a real trailing comment", () => {
    const out = importHermesYaml('mcp_servers:\n  a:\n    command: "node"  # run it\n    args: ["a#b", c]\n');
    expect(out.mcp.a).toEqual({ command: "node", args: ["a#b", "c"] });
  });
});
