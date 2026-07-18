import { describe, it, expect } from "vitest";
import { buildToolsUpdates, TOOLSETS, TOOL_PROVIDERS } from "./setup-tools.js";

describe("TOOLSETS catalog", () => {
  it("has unique ids and at least one tool each", () => {
    const ids = TOOLSETS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(TOOLSETS.every((t) => t.tools.length > 0)).toBe(true);
  });

  it("only the browser toolset carries a live env kill-switch", () => {
    const withEnv = TOOLSETS.filter((t) => t.envOff).map((t) => t.id);
    expect(withEnv).toEqual(["browser"]);
    expect(TOOLSETS.find((t) => t.id === "browser")!.envOff).toBe("VANTA_BROWSER_DISABLED");
  });

  it("provider sub-menus write the env var the tools already read", () => {
    const byId = Object.fromEntries(TOOL_PROVIDERS.map((p) => [p.id, p.env]));
    expect(byId.vision).toBe("VANTA_VISION_PROVIDER");
    expect(byId.search).toBe("VANTA_SEARCH_PROVIDER");
  });

  it("presents auto first and labels DDG-derived providers as legacy", () => {
    const options = TOOL_PROVIDERS.find((provider) => provider.id === "search")!.options;
    expect(options[0]).toMatchObject({ value: "auto" });
    expect(options.filter((option) => ["ddg", "jina_ddg"].includes(option.value ?? "")))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ label: expect.stringMatching(/legacy/i), value: "ddg" }),
        expect.objectContaining({ label: expect.stringMatching(/legacy/i), value: "jina_ddg" }),
      ]));
  });
});

describe("buildToolsUpdates — defaults preserve current behavior", () => {
  it("an empty selection writes no env and keeps blockedTools as the current list", () => {
    const updates = buildToolsUpdates({}, ["shell_cmd"]);
    expect(updates.env).toEqual({});
    expect(updates.settings.blockedTools).toEqual(["shell_cmd"]);
  });

  it("an undefined toolset decision is a no-op", () => {
    const updates = buildToolsUpdates({ toolsets: { browser: undefined } });
    expect(updates.env).toEqual({});
    expect(updates.settings.blockedTools).toEqual([]);
  });
});

describe("buildToolsUpdates — disabling a toolset blocks its tools", () => {
  it("disabling comms adds every gmail/calendar/drive tool to blockedTools", () => {
    const updates = buildToolsUpdates({ toolsets: { comms: false } });
    expect(updates.settings.blockedTools).toEqual(
      expect.arrayContaining(["gmail_search", "gmail_send", "calendar_read", "drive_update"]),
    );
    expect(updates.env).toEqual({});
  });

  it("disabling browser blocks its tools AND sets the live kill-switch env", () => {
    const updates = buildToolsUpdates({ toolsets: { browser: false } });
    expect(updates.settings.blockedTools).toEqual(
      expect.arrayContaining(["browser_navigate", "browser_act", "screenshot"]),
    );
    expect(updates.env.VANTA_BROWSER_DISABLED).toBe("1");
  });
});

describe("buildToolsUpdates — enabling a toolset unblocks its tools", () => {
  it("enabling git removes its tools from a prior blockedTools list", () => {
    const updates = buildToolsUpdates(
      { toolsets: { git: true } },
      ["git_push", "git_commit", "shell_cmd"],
    );
    expect(updates.settings.blockedTools).toEqual(["shell_cmd"]);
  });

  it("enabling browser clears the kill-switch env", () => {
    const updates = buildToolsUpdates(
      { toolsets: { browser: true } },
      ["browser_act"],
    );
    expect(updates.settings.blockedTools).not.toContain("browser_act");
    expect(updates.env.VANTA_BROWSER_DISABLED).toBe("");
  });
});

describe("buildToolsUpdates — provider selection writes provider env", () => {
  it("a vision provider choice writes VANTA_VISION_PROVIDER", () => {
    const updates = buildToolsUpdates({ providers: { vision: "anthropic" } });
    expect(updates.env.VANTA_VISION_PROVIDER).toBe("anthropic");
  });

  it("a search provider choice writes VANTA_SEARCH_PROVIDER", () => {
    const updates = buildToolsUpdates({ providers: { search: "brave" } });
    expect(updates.env.VANTA_SEARCH_PROVIDER).toBe("brave");
  });

  it("an empty provider value is ignored", () => {
    const updates = buildToolsUpdates({ providers: { vision: "" } });
    expect(updates.env).toEqual({});
  });
});

describe("buildToolsUpdates — combined selection", () => {
  it("maps toolset toggles and provider picks together, deduped and sorted", () => {
    const updates = buildToolsUpdates(
      { toolsets: { comms: false, git: true }, providers: { search: "serpapi" } },
      ["git_push", "shell_cmd"],
    );
    // git unblocked, comms blocked, prior shell_cmd preserved
    expect(updates.settings.blockedTools).not.toContain("git_push");
    expect(updates.settings.blockedTools).toContain("shell_cmd");
    expect(updates.settings.blockedTools).toContain("gmail_send");
    // sorted + deduped
    const b = updates.settings.blockedTools ?? [];
    expect([...b]).toEqual([...b].sort());
    expect(new Set(b).size).toBe(b.length);
    expect(updates.env.VANTA_SEARCH_PROVIDER).toBe("serpapi");
  });
});
