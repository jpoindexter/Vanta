import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as ts from "typescript";
import {
  mapReferences,
  mapSymbols,
  mapQuickInfo,
  findReferences,
  documentSymbols,
  hoverInfo,
} from "./ts-service-extra.js";

/** A minimal stand-in for a `ts.SourceFile`, just the two methods the mapper uses. */
function fakeSource(text: string): ts.SourceFile {
  return ts.createSourceFile("fake.ts", text, ts.ScriptTarget.Latest, true);
}

describe("mapReferences (pure)", () => {
  it("maps entries to 1-based line/col with trimmed line text", () => {
    const source = fakeSource("const foo = 1;\nconst bar = foo;\n");
    // `foo` reuse on line 2 starts at flat offset 27 (0-based char 12).
    const offset = source.getPositionOfLineAndCharacter(1, 12);
    const entries = [
      { fileName: "fake.ts", textSpan: { start: offset, length: 3 } },
    ] as unknown as ts.ReferenceEntry[];

    const refs = mapReferences(entries, () => source);

    expect(refs).toEqual([
      { file: "fake.ts", line: 2, col: 13, text: "const bar = foo;" },
    ]);
  });

  it("drops entries whose source cannot be resolved (no throw)", () => {
    const entries = [
      { fileName: "missing.ts", textSpan: { start: 0, length: 1 } },
    ] as unknown as ts.ReferenceEntry[];

    expect(mapReferences(entries, () => undefined)).toEqual([]);
  });
});

describe("mapSymbols (pure)", () => {
  it("flattens a NavigationTree, skipping the root, into 1-based lines", () => {
    // Root spans the file; children are the declarations.
    const tree = {
      text: "<global>",
      kind: ts.ScriptElementKind.moduleElement,
      spans: [{ start: 0, length: 80 }],
      childItems: [
        {
          text: "greet",
          kind: ts.ScriptElementKind.functionElement,
          spans: [{ start: 0, length: 20 }],
          childItems: [
            {
              text: "name",
              kind: ts.ScriptElementKind.parameterElement,
              spans: [{ start: 40, length: 4 }],
            },
          ],
        },
      ],
    } as unknown as ts.NavigationTree;

    // Pretend offset 0 is line 0, offset 40 is line 2 (0-based).
    const getLine = (pos: number): number => (pos === 0 ? 0 : 2);
    const symbols = mapSymbols(tree, getLine);

    expect(symbols).toEqual([
      { name: "greet", kind: "function", line: 1 },
      { name: "name", kind: "parameter", line: 3 },
    ]);
  });

  it("returns [] for an undefined tree (no throw)", () => {
    expect(mapSymbols(undefined, () => 0)).toEqual([]);
  });
});

describe("mapQuickInfo (pure)", () => {
  it("returns display + docs from a QuickInfo with documentation", () => {
    const info = {
      displayParts: [{ text: "const foo: number" }],
      documentation: [{ text: "The answer." }],
    } as unknown as ts.QuickInfo;

    expect(mapQuickInfo(info)).toEqual({
      display: "const foo: number",
      docs: "The answer.",
    });
  });

  it("omits docs when documentation is empty", () => {
    const info = {
      displayParts: [{ text: "let x: string" }],
      documentation: [],
    } as unknown as ts.QuickInfo;

    expect(mapQuickInfo(info)).toEqual({ display: "let x: string" });
  });

  it("returns null for undefined quick-info (no symbol under cursor)", () => {
    expect(mapQuickInfo(undefined)).toBeNull();
  });
});

describe("real service calls on a temp fixture", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "vanta-lsp-extra-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("findReferences finds the declaration plus 2 uses of a symbol", async () => {
    const file = join(dir, "refs.ts");
    // `total` is declared on line 1 and used on lines 2 and 3.
    await writeFile(
      file,
      "const total = 1;\nconst a = total + 1;\nconst b = total + 2;\n",
    );

    // Position the cursor on the `total` declaration (1-based line 1, col 7).
    const refs = findReferences(file, 1, 7);

    expect(refs.length).toBe(3);
    const lines = refs.map((r) => r.line).sort((x, y) => x - y);
    expect(lines).toEqual([1, 2, 3]);
    expect(refs.every((r) => r.file === file)).toBe(true);
  });

  it("findReferences returns [] for an out-of-range position (no throw)", async () => {
    const file = join(dir, "small.ts");
    await writeFile(file, "const x = 1;\n");

    expect(findReferences(file, 999, 999)).toEqual([]);
  });

  it("documentSymbols lists the declared top-level symbols", async () => {
    const file = join(dir, "syms.ts");
    await writeFile(
      file,
      "export const num = 1;\nexport function greet() {\n  return num;\n}\n",
    );

    const symbols = documentSymbols(file);
    const names = symbols.map((s) => s.name);

    expect(names).toContain("num");
    expect(names).toContain("greet");
    const greet = symbols.find((s) => s.name === "greet");
    expect(greet?.line).toBe(2);
  });

  it("hoverInfo returns the type display for a symbol", async () => {
    const file = join(dir, "hover.ts");
    await writeFile(file, "const answer: number = 42;\nconst use = answer;\n");

    // Hover the `answer` use on line 2 (1-based col 13).
    const hover = hoverInfo(file, 2, 13);

    expect(hover).not.toBeNull();
    expect(hover?.display).toContain("answer");
    expect(hover?.display).toContain("number");
  });

  it("hoverInfo returns null over whitespace (no symbol)", async () => {
    const file = join(dir, "blank.ts");
    await writeFile(file, "const x = 1;\n   \n");

    // Line 2 is whitespace — no symbol under the cursor.
    expect(hoverInfo(file, 2, 2)).toBeNull();
  });
});
