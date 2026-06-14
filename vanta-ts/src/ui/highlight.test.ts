import { describe, it, expect } from "vitest";
import { highlightLine, type HlSeg } from "./highlight.js";

function join(segs: HlSeg[]): string {
  return segs.map((s) => s.text).join("");
}

function classes(segs: HlSeg[]): string[] {
  return segs.map((s) => s.cls);
}

function cls(segs: HlSeg[], text: string): string | undefined {
  return segs.find((s) => s.text === text)?.cls;
}

describe("losslessness invariant", () => {
  const cases: Array<[string, string]> = [
    ["const x = 42;", "ts"],
    ['const s = "hello";', "ts"],
    ["// a comment line", "ts"],
    ["def foo(x): # inline", "python"],
    ["if [ -z $VAR ]; then", "bash"],
    ['{"key": true, "n": 3.14}', "json"],
    ["fn main() { let x = 0x1F; }", "rust"],
    ["func foo() int { return 0 }", "go"],
    ["this is plain unknown text 123", "cobol"],
    ['let s = `unterminated backtick', "ts"],
    ['let s = "unterminated double', "ts"],
  ];
  for (const [line, lang] of cases) {
    it(`${lang}: ${JSON.stringify(line)}`, () => {
      const segs = highlightLine(line, lang);
      expect(join(segs)).toBe(line);
    });
  }
});

describe("TypeScript / JavaScript", () => {
  it("classifies keywords", () => {
    const segs = highlightLine("const x = 42;", "ts");
    expect(cls(segs, "const")).toBe("keyword");
  });

  it("classifies integer numbers", () => {
    const segs = highlightLine("const x = 42;", "ts");
    expect(cls(segs, "42")).toBe("number");
  });

  it("classifies string literals", () => {
    const segs = highlightLine('const s = "hello";', "ts");
    expect(cls(segs, '"hello"')).toBe("string");
  });

  it("classifies single-quoted strings", () => {
    const segs = highlightLine("const s = 'world';", "js");
    expect(cls(segs, "'world'")).toBe("string");
  });

  it("classifies template literals", () => {
    const segs = highlightLine("const s = `tmpl`;", "tsx");
    expect(cls(segs, "`tmpl`")).toBe("string");
  });

  it("classifies // line comments", () => {
    const segs = highlightLine("// a comment line", "ts");
    expect(segs).toHaveLength(1);
    expect(segs[0]?.cls).toBe("comment");
    expect(segs[0]?.text).toBe("// a comment line");
  });

  it("classifies inline // comment after code", () => {
    const segs = highlightLine("let x = 1; // note", "ts");
    expect(cls(segs, "// note")).toBe("comment");
    expect(cls(segs, "let")).toBe("keyword");
  });

  it("classifies /* block comment */ on one line", () => {
    const segs = highlightLine("let x = /* mid */ 1;", "ts");
    expect(cls(segs, "/* mid */")).toBe("comment");
  });

  it("classifies hex numbers", () => {
    const segs = highlightLine("const h = 0xFF;", "ts");
    expect(cls(segs, "0xFF")).toBe("number");
  });

  it("classifies float numbers", () => {
    const segs = highlightLine("const pi = 3.14;", "ts");
    expect(cls(segs, "3.14")).toBe("number");
  });

  it("plain identifiers remain plain", () => {
    const segs = highlightLine("const myVar = 0;", "ts");
    expect(cls(segs, "myVar")).toBe("plain");
  });

  it("unterminated string runs to end of line", () => {
    const line = 'let s = "unterminated';
    const segs = highlightLine(line, "ts");
    expect(join(segs)).toBe(line);
    expect(segs.some((s) => s.cls === "string" && s.text.startsWith('"'))).toBe(true);
  });

  it("unterminated backtick string", () => {
    const line = "let s = `unterminated backtick";
    const segs = highlightLine(line, "ts");
    expect(join(segs)).toBe(line);
    expect(segs.some((s) => s.cls === "string")).toBe(true);
  });

  it("classifies false / null / undefined / true as keywords", () => {
    const segs = highlightLine("return true || false;", "ts");
    expect(cls(segs, "true")).toBe("keyword");
    expect(cls(segs, "false")).toBe("keyword");
  });
});

describe("Python", () => {
  it("classifies def and return as keywords", () => {
    const segs = highlightLine("def foo(): return None", "python");
    expect(cls(segs, "def")).toBe("keyword");
    expect(cls(segs, "return")).toBe("keyword");
    expect(cls(segs, "None")).toBe("keyword");
  });

  it("classifies # comments", () => {
    const segs = highlightLine("x = 1  # comment", "py");
    expect(cls(segs, "# comment")).toBe("comment");
  });

  it("classifies inline # after code", () => {
    const segs = highlightLine("def foo(x): # inline", "python");
    expect(cls(segs, "def")).toBe("keyword");
    expect(cls(segs, "# inline")).toBe("comment");
  });

  it("classifies string literals", () => {
    const segs = highlightLine("name = 'alice'", "py");
    expect(cls(segs, "'alice'")).toBe("string");
  });
});

describe("Bash", () => {
  it("classifies if/then/fi as keywords", () => {
    const segs = highlightLine("if true; then", "bash");
    expect(cls(segs, "if")).toBe("keyword");
    expect(cls(segs, "then")).toBe("keyword");
  });

  it("classifies # comments", () => {
    const segs = highlightLine("# bash comment", "sh");
    expect(segs[0]?.cls).toBe("comment");
  });

  it("classifies export keyword", () => {
    const segs = highlightLine("export FOO=bar", "bash");
    expect(cls(segs, "export")).toBe("keyword");
  });
});

describe("Rust", () => {
  it("classifies fn / let / mut", () => {
    const segs = highlightLine("fn main() { let mut x = 0x1F; }", "rust");
    expect(cls(segs, "fn")).toBe("keyword");
    expect(cls(segs, "let")).toBe("keyword");
    expect(cls(segs, "mut")).toBe("keyword");
    expect(cls(segs, "0x1F")).toBe("number");
  });

  it("classifies // comments", () => {
    const segs = highlightLine("// rust comment", "rust");
    expect(segs[0]?.cls).toBe("comment");
  });
});

describe("Go", () => {
  it("classifies func / return", () => {
    const segs = highlightLine("func foo() int { return 0 }", "go");
    expect(cls(segs, "func")).toBe("keyword");
    expect(cls(segs, "return")).toBe("keyword");
    expect(cls(segs, "0")).toBe("number");
  });

  it("classifies // comments", () => {
    const segs = highlightLine("// go comment", "go");
    expect(segs[0]?.cls).toBe("comment");
  });
});

describe("JSON", () => {
  it("classifies true / false / null as keyword", () => {
    const segs = highlightLine('{"ok": true, "v": null}', "json");
    expect(cls(segs, "true")).toBe("keyword");
    expect(cls(segs, "null")).toBe("keyword");
  });

  it("classifies quoted keys and values as string", () => {
    const segs = highlightLine('{"key": "val"}', "json");
    expect(segs.filter((s) => s.cls === "string").map((s) => s.text)).toContain('"key"');
    expect(segs.filter((s) => s.cls === "string").map((s) => s.text)).toContain('"val"');
  });

  it("classifies numbers", () => {
    const segs = highlightLine('{"n": 3.14}', "json");
    expect(cls(segs, "3.14")).toBe("number");
  });

  it("is lossless on a complex object line", () => {
    const line = '  "name": "vanta", "count": 42, "active": false';
    const segs = highlightLine(line, "json");
    expect(join(segs)).toBe(line);
  });
});

describe("Unknown language", () => {
  it("returns a single plain segment for simple text", () => {
    const line = "this is plain text";
    const segs = highlightLine(line, "cobol");
    expect(join(segs)).toBe(line);
    expect(classes(segs).every((c) => c === "plain")).toBe(true);
  });

  it("lossless on a number-like token in unknown lang", () => {
    const line = "total 42 items";
    const segs = highlightLine(line, "cobol");
    expect(join(segs)).toBe(line);
  });
});
