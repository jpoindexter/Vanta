import { describe, expect, it } from "vitest";
import { parsePackageLaunch, unpinnedNote } from "./package-spec.js";

const names = (command: string, args: string[]) => parsePackageLaunch(command, args).map((s) => [s.ecosystem, s.name, s.version, s.pinned]);

describe("parsePackageLaunch", () => {
  it("parses npx with flags, plain and unpinned", () => {
    expect(names("npx", ["-y", "some-mcp"])).toEqual([["npm", "some-mcp", undefined, false]]);
  });

  it("parses scoped names with and without a version", () => {
    expect(names("npx", ["@modelcontextprotocol/server-filesystem", "/tmp"])).toEqual([["npm", "@modelcontextprotocol/server-filesystem", undefined, false]]);
    expect(names("npx", ["-y", "@scope/pkg@1.2.3"])).toEqual([["npm", "@scope/pkg", "1.2.3", true]]);
    expect(names("npx", ["@scope/pkg@latest"])).toEqual([["npm", "@scope/pkg", "latest", false]]);
  });

  it("treats ranges and tags as unpinned and exact versions as pinned", () => {
    expect(parsePackageLaunch("npx", ["a@^1.0.0"])[0]?.pinned).toBe(false);
    expect(parsePackageLaunch("npx", ["a@1.0.0"])[0]?.pinned).toBe(true);
  });

  it("uses --package for the package and ignores the command that follows", () => {
    expect(names("npx", ["--package=real-pkg@2.0.0", "-y", "bin-name"])).toEqual([["npm", "real-pkg", "2.0.0", true]]);
    expect(names("npx", ["-p", "real-pkg", "bin-name"])).toEqual([["npm", "real-pkg", undefined, false]]);
  });

  it("skips value flags so their argument is not read as the package", () => {
    expect(names("npx", ["--registry", "https://example.test", "-y", "pkg"])).toEqual([["npm", "pkg", undefined, false]]);
  });

  it("parses pnpm dlx, yarn dlx, bunx, bun x, npm exec and npm x", () => {
    for (const [cmd, args] of [
      ["pnpm", ["dlx", "pkg@1.0.0"]], ["yarn", ["dlx", "pkg@1.0.0"]], ["bunx", ["pkg@1.0.0"]],
      ["bun", ["x", "pkg@1.0.0"]], ["npm", ["exec", "--", "pkg@1.0.0"]], ["npm", ["x", "pkg@1.0.0"]],
    ] as const) {
      expect(names(cmd, [...args])).toEqual([["npm", "pkg", "1.0.0", true]]);
    }
  });

  it("parses uvx forms: ==, @, extras, --from and --with", () => {
    expect(names("uvx", ["some-mcp==1.2.3"])).toEqual([["pypi", "some-mcp", "1.2.3", true]]);
    expect(names("uvx", ["some_mcp@latest"])).toEqual([["pypi", "some-mcp", "latest", false]]);
    expect(names("uvx", ["Some.MCP[extra]==2.0"])).toEqual([["pypi", "some-mcp", "2.0", true]]);
    expect(names("uvx", ["--python", "3.12", "--from", "real-pkg>=1", "--with", "helper==1.0", "cmd"])).toEqual([
      ["pypi", "real-pkg", undefined, false], ["pypi", "helper", "1.0", true],
    ]);
  });

  it("parses pipx run and uv tool run", () => {
    expect(names("pipx", ["run", "--spec", "pkg==3.0", "app"])).toEqual([["pypi", "pkg", "3.0", true]]);
    expect(names("pipx", ["run", "pkg"])).toEqual([["pypi", "pkg", undefined, false]]);
    expect(names("uv", ["tool", "run", "pkg==1.0"])).toEqual([["pypi", "pkg", "1.0", true]]);
  });

  it("recognizes runner paths and windows suffixes", () => {
    expect(names("/opt/homebrew/bin/npx", ["pkg"])).toHaveLength(1);
    expect(names("C:\\Program Files\\nodejs\\npx.cmd", ["pkg"])).toHaveLength(1);
  });

  it("returns nothing for non-runner commands and non-registry sources", () => {
    expect(parsePackageLaunch("node", ["server.js"])).toEqual([]);
    expect(parsePackageLaunch("npm", ["install", "pkg"])).toEqual([]);
    expect(parsePackageLaunch("npx", ["github:user/repo"])).toEqual([]);
    expect(parsePackageLaunch("npx", ["https://example.test/x.tgz"])).toEqual([]);
    expect(parsePackageLaunch("npx", ["./local-server"])).toEqual([]);
    expect(parsePackageLaunch("uvx", ["git+https://example.test/x.git"])).toEqual([]);
  });
});

describe("unpinnedNote", () => {
  it("names unpinned packages and says why it matters", () => {
    const note = unpinnedNote("npx", ["-y", "some-mcp@latest"]);
    expect(note).toContain("Unpinned package: some-mcp@latest");
    expect(note).toContain("npx fetches whatever is newest");
  });

  it("flags a missing version and stays silent when pinned or not a package launch", () => {
    expect(unpinnedNote("uvx", ["some-mcp"])).toContain("some-mcp (no version)");
    expect(unpinnedNote("npx", ["some-mcp@1.0.0"])).toBeNull();
    expect(unpinnedNote("node", ["x.js"])).toBeNull();
  });
});
