import { describe, expect, it } from "vitest";
import { parsePluginLsp, resolveLspServers, lspForExtension, type PluginLspConfig } from "./lsp-config.js";

const PYRIGHT: PluginLspConfig = {
  language: "python",
  command: ["pyright-langserver", "--stdio"],
  extensions: [".py", ".pyi"],
};

describe("parsePluginLsp", () => {
  it("parses a manifest's lsp array into configs", () => {
    const manifest = {
      name: "py",
      version: "0.1.0",
      lsp: [{ language: "python", command: ["pyright-langserver", "--stdio"], extensions: [".py", ".pyi"] }],
    };
    expect(parsePluginLsp(manifest)).toEqual([PYRIGHT]);
  });

  it("parses multiple configs in one manifest", () => {
    const manifest = {
      lsp: [
        { language: "rust", command: ["rust-analyzer"], extensions: [".rs"] },
        { language: "go", command: ["gopls"], extensions: [".go"] },
      ],
    };
    const configs = parsePluginLsp(manifest);
    expect(configs.map((c) => c.language)).toEqual(["rust", "go"]);
  });

  it("returns [] when the manifest has no lsp field", () => {
    expect(parsePluginLsp({ name: "x", version: "1.0.0" })).toEqual([]);
  });

  it("returns [] when lsp is not an array", () => {
    expect(parsePluginLsp({ lsp: { language: "python" } })).toEqual([]);
    expect(parsePluginLsp({ lsp: "python" })).toEqual([]);
    expect(parsePluginLsp({ lsp: 42 })).toEqual([]);
  });

  it("returns [] for non-object / garbage input", () => {
    expect(parsePluginLsp(null)).toEqual([]);
    expect(parsePluginLsp(undefined)).toEqual([]);
    expect(parsePluginLsp("garbage")).toEqual([]);
    expect(parsePluginLsp(123)).toEqual([]);
    expect(parsePluginLsp([])).toEqual([]);
  });

  it("drops a config with an empty command (nothing to spawn)", () => {
    const manifest = { lsp: [{ language: "python", command: [], extensions: [".py"] }] };
    expect(parsePluginLsp(manifest)).toEqual([]);
  });

  it("drops a config with no language", () => {
    const manifest = { lsp: [{ language: "", command: ["pyright"], extensions: [".py"] }] };
    expect(parsePluginLsp(manifest)).toEqual([]);
    const whitespace = { lsp: [{ language: "   ", command: ["pyright"], extensions: [".py"] }] };
    expect(parsePluginLsp(whitespace)).toEqual([]);
  });

  it("drops a config with no extensions", () => {
    const manifest = { lsp: [{ language: "python", command: ["pyright"], extensions: [] }] };
    expect(parsePluginLsp(manifest)).toEqual([]);
  });

  it("drops invalid entries but keeps the valid ones", () => {
    const manifest = {
      lsp: [
        { language: "python", command: ["pyright"], extensions: [".py"] },
        { language: "broken", command: [], extensions: [".x"] }, // empty command → dropped
        { nonsense: true }, // unknown shape → dropped
        { language: "rust", command: ["rust-analyzer"], extensions: ["rs"] }, // ext without dot → normalized
      ],
    };
    const configs = parsePluginLsp(manifest);
    expect(configs.map((c) => c.language)).toEqual(["python", "rust"]);
    expect(configs[1]?.extensions).toEqual([".rs"]);
  });

  it("rejects an entry with unknown keys (strict)", () => {
    const manifest = { lsp: [{ language: "python", command: ["pyright"], extensions: [".py"], rogue: 1 }] };
    expect(parsePluginLsp(manifest)).toEqual([]);
  });

  it("normalizes extensions to a leading-dot lowercase form", () => {
    const manifest = { lsp: [{ language: "python", command: ["pyright"], extensions: ["PY", ".Pyi"] }] };
    expect(parsePluginLsp(manifest)[0]?.extensions).toEqual([".py", ".pyi"]);
  });
});

describe("resolveLspServers", () => {
  it("merges configs across plugins", () => {
    const a = [PYRIGHT];
    const b: PluginLspConfig[] = [{ language: "rust", command: ["rust-analyzer"], extensions: [".rs"] }];
    const { configs, clashes } = resolveLspServers([a, b]);
    expect(configs.map((c) => c.language)).toEqual(["python", "rust"]);
    expect(clashes).toEqual([]);
  });

  it("dedupes by language — first plugin wins on a clash", () => {
    const first: PluginLspConfig[] = [{ language: "python", command: ["pyright"], extensions: [".py"] }];
    const second: PluginLspConfig[] = [{ language: "python", command: ["pylsp"], extensions: [".py"] }];
    const { configs, clashes } = resolveLspServers([first, second]);
    expect(configs).toHaveLength(1);
    expect(configs[0]?.command).toEqual(["pyright"]);
    expect(clashes).toEqual([
      { language: "python", keptCommand: ["pyright"], droppedCommand: ["pylsp"] },
    ]);
  });

  it("treats a language clash case-insensitively", () => {
    const first: PluginLspConfig[] = [{ language: "Python", command: ["pyright"], extensions: [".py"] }];
    const second: PluginLspConfig[] = [{ language: "python", command: ["pylsp"], extensions: [".py"] }];
    const { configs, clashes } = resolveLspServers([first, second]);
    expect(configs).toHaveLength(1);
    expect(clashes).toHaveLength(1);
  });

  it("drops a config with an invalid (empty) command", () => {
    const list: PluginLspConfig[] = [{ language: "python", command: [], extensions: [".py"] }];
    expect(resolveLspServers([list]).configs).toEqual([]);
  });

  it("returns empty for no plugins", () => {
    expect(resolveLspServers([])).toEqual({ configs: [], clashes: [] });
    expect(resolveLspServers([[]])).toEqual({ configs: [], clashes: [] });
  });
});

describe("lspForExtension", () => {
  const configs = [PYRIGHT, { language: "rust", command: ["rust-analyzer"], extensions: [".rs"] }];

  it("matches by extension with a leading dot", () => {
    expect(lspForExtension(configs, ".py")?.language).toBe("python");
    expect(lspForExtension(configs, ".rs")?.language).toBe("rust");
  });

  it("matches by extension without a leading dot", () => {
    expect(lspForExtension(configs, "py")?.language).toBe("python");
    expect(lspForExtension(configs, "pyi")?.language).toBe("python");
  });

  it("matches case-insensitively", () => {
    expect(lspForExtension(configs, ".PY")?.language).toBe("python");
    expect(lspForExtension(configs, "RS")?.language).toBe("rust");
  });

  it("returns null for an unserved extension", () => {
    expect(lspForExtension(configs, ".go")).toBeNull();
  });

  it("returns null for garbage / empty input", () => {
    expect(lspForExtension(configs, "")).toBeNull();
    expect(lspForExtension(configs, "   ")).toBeNull();
    expect(lspForExtension([], ".py")).toBeNull();
  });
});
