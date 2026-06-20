import { describe, it, expect } from "vitest";
import { join } from "node:path";
import {
  parseOutputStyle,
  listOutputStyles,
  resolveOutputStyle,
  outputStyleSection,
  defaultStyleDirs,
  type OutputStyleDeps,
} from "./output-styles.js";

/** Build an in-memory deps object from a {dir: {file: text}} map — no real disk. */
function memDeps(tree: Record<string, Record<string, string | null>>): OutputStyleDeps {
  return {
    dirs: Object.keys(tree),
    listMd: (dir) => Object.keys(tree[dir] ?? {}),
    readText: (path) => {
      for (const [dir, files] of Object.entries(tree)) {
        for (const file of Object.keys(files)) {
          if (join(dir, file) === path) return files[file] ?? null;
        }
      }
      return null;
    },
  };
}

describe("parseOutputStyle", () => {
  it("parses frontmatter name + description and extracts the body", () => {
    const text = ["---", "name: Terse", "description: Maximum density", "---", "", "Be brief.", "No filler."].join("\n");
    const style = parseOutputStyle(text);
    expect(style.name).toBe("Terse");
    expect(style.description).toBe("Maximum density");
    expect(style.body).toBe("Be brief.\nNo filler.");
  });

  it("splits each frontmatter line on the FIRST colon (values may contain colons)", () => {
    const text = ["---", "name: Ratio", "description: do x: then y", "---", "body"].join("\n");
    const style = parseOutputStyle(text);
    expect(style.description).toBe("do x: then y");
  });

  it("with no frontmatter → whole text is the body and name slugs from the fallback", () => {
    // Callers (listOutputStyles) pass the already-.md-stripped basename.
    const style = parseOutputStyle("Just a body, no frontmatter.", "My Style");
    expect(style.description).toBe("");
    expect(style.body).toBe("Just a body, no frontmatter.");
    expect(style.name).toBe("my-style");
  });

  it("missing frontmatter with no fallback → name slugs from the body's first line", () => {
    const style = parseOutputStyle("Operator Voice\nbe direct");
    expect(style.name).toBe("operator-voice");
    expect(style.body).toBe("Operator Voice\nbe direct");
  });

  it("frontmatter present but name omitted → name falls back to the slugged fallback", () => {
    const text = ["---", "description: no name here", "---", "the body"].join("\n");
    const style = parseOutputStyle(text, "fallback-name");
    expect(style.name).toBe("fallback-name");
    expect(style.description).toBe("no name here");
  });

  it("empty input → a non-empty default slug name and empty body", () => {
    const style = parseOutputStyle("");
    expect(style.name).toBe("output-style");
    expect(style.body).toBe("");
  });
});

describe("listOutputStyles", () => {
  const proj = "/repo/.claude/output-styles";
  const user = "/home/output-styles";

  it("reads styles from BOTH injected dirs", () => {
    const deps = memDeps({
      [proj]: { "terse.md": "---\nname: Terse\n---\nbrief" },
      [user]: { "warm.md": "---\nname: Warm\n---\nfriendly" },
    });
    const names = listOutputStyles(deps).map((s) => s.name).sort();
    expect(names).toEqual(["Terse", "Warm"]);
  });

  it("ignores non-.md files and skips unreadable (null) files", () => {
    const deps = memDeps({
      [proj]: { "terse.md": "---\nname: Terse\n---\nx", "notes.txt": "ignore me", "broken.md": null },
    });
    expect(listOutputStyles(deps).map((s) => s.name)).toEqual(["Terse"]);
  });

  it("earlier dir (project) wins on a name collision", () => {
    const deps = memDeps({
      [proj]: { "a.md": "---\nname: Dup\ndescription: from project\n---\nproj body" },
      [user]: { "b.md": "---\nname: dup\ndescription: from user\n---\nuser body" },
    });
    const styles = listOutputStyles(deps);
    expect(styles).toHaveLength(1);
    expect(styles[0]?.description).toBe("from project");
  });

  it("missing dirs (empty listing) → empty result, no throw", () => {
    expect(listOutputStyles(memDeps({ [proj]: {}, [user]: {} }))).toEqual([]);
  });
});

describe("resolveOutputStyle", () => {
  const proj = "/repo/.claude/output-styles";
  const deps = memDeps({
    [proj]: {
      "terse.md": "---\nname: Terse\ndescription: tight\n---\nBe brief.",
      "warm.md": "---\nname: Warm\n---\nBe friendly.",
    },
  });

  it("selects by explicit name, case-insensitively", () => {
    expect(resolveOutputStyle({ name: "terse" }, deps)?.name).toBe("Terse");
    expect(resolveOutputStyle({ name: "TERSE" }, deps)?.name).toBe("Terse");
  });

  it("reads the name from VANTA_OUTPUT_STYLE when no explicit name", () => {
    const env = { VANTA_OUTPUT_STYLE: "warm" } as unknown as NodeJS.ProcessEnv;
    expect(resolveOutputStyle({ env }, deps)?.name).toBe("Warm");
  });

  it("uses the injected settingsName when neither arg nor env is set", () => {
    expect(resolveOutputStyle({ settingsName: "terse" }, deps)?.name).toBe("Terse");
  });

  it("precedence: explicit arg > env > settings", () => {
    const env = { VANTA_OUTPUT_STYLE: "warm" } as unknown as NodeJS.ProcessEnv;
    expect(resolveOutputStyle({ name: "terse", env, settingsName: "warm" }, deps)?.name).toBe("Terse");
    expect(resolveOutputStyle({ env, settingsName: "terse" }, deps)?.name).toBe("Warm");
  });

  it("no selection at all → null (no injection — current behavior)", () => {
    expect(resolveOutputStyle({}, deps)).toBeNull();
    expect(resolveOutputStyle({ env: {} as NodeJS.ProcessEnv }, deps)).toBeNull();
  });

  it("a selected name that matches nothing → null", () => {
    expect(resolveOutputStyle({ name: "nonexistent" }, deps)).toBeNull();
  });
});

describe("outputStyleSection", () => {
  it("formats the selected style as a # Output Style: <name> behavior block", () => {
    const style = { name: "Terse", description: "tight", body: "Be brief.\nNo filler." };
    expect(outputStyleSection(style)).toBe("# Output Style: Terse\nBe brief.\nNo filler.");
  });

  it("null style → empty string (no injection — dropped by .filter(Boolean))", () => {
    expect(outputStyleSection(null)).toBe("");
  });

  it("a style with a blank body → empty string", () => {
    expect(outputStyleSection({ name: "Empty", description: "", body: "   " })).toBe("");
  });
});

describe("defaultStyleDirs", () => {
  it("returns project .claude/output-styles first, then ~/.vanta/output-styles", () => {
    expect(defaultStyleDirs("/repo", "/home/me/.vanta")).toEqual([
      "/repo/.claude/output-styles",
      "/home/me/.vanta/output-styles",
    ]);
  });
});
