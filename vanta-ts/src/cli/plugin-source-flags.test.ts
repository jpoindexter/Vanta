import { describe, expect, it } from "vitest";
import { parsePluginSourceFlags } from "./plugin-source-flags.js";

describe("parsePluginSourceFlags", () => {
  it("passes through args with no plugin flags", () => {
    const r = parsePluginSourceFlags(["chat", "--no-tui"]);
    expect(r.sources).toEqual([]);
    expect(r.rest).toEqual(["chat", "--no-tui"]);
    expect(r.error).toBeUndefined();
  });

  it("parses --plugin-url and --plugin-dir as space-separated values", () => {
    const r = parsePluginSourceFlags(["--plugin-url", "https://x/p.zip", "--plugin-dir", "/tmp/p"]);
    expect(r.sources).toEqual([{ url: "https://x/p.zip" }, { dir: "/tmp/p" }]);
    expect(r.rest).toEqual([]);
  });

  it("parses the --flag=value form", () => {
    const r = parsePluginSourceFlags(["--plugin-url=https://x/p.zip", "--plugin-dir=/tmp/p"]);
    expect(r.sources).toEqual([{ url: "https://x/p.zip" }, { dir: "/tmp/p" }]);
  });

  it("keeps non-flag args while extracting flags", () => {
    const r = parsePluginSourceFlags(["run", "--plugin-dir", "/tmp/p", "do a thing"]);
    expect(r.sources).toEqual([{ dir: "/tmp/p" }]);
    expect(r.rest).toEqual(["run", "do a thing"]);
  });

  it("reports an error when a value is missing", () => {
    const r = parsePluginSourceFlags(["--plugin-url"]);
    expect(r.error).toContain("requires a value");
    expect(r.sources).toEqual([]);
  });
});
