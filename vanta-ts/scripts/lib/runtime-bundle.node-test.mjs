import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { eagerChunks, packageName } from "./eager-graph.mjs";
import { buildRuntimeBundle, rewriteSourceUrls } from "./runtime-bundle.mjs";

test("rewriteSourceUrls pins import.meta.url to the original source path", () => {
  const out = rewriteSourceUrls('const w = new URL("./x.wasm", import.meta.url);', "src/permissions/a.ts");
  assert.equal(out, 'const w = new URL("./x.wasm", __vantaSourceUrl("src/permissions/a.ts"));');
});

test("rewriteSourceUrls leaves modules without import.meta.url untouched", () => {
  assert.equal(rewriteSourceUrls("export const a = 1;", "src/a.ts"), "export const a = 1;");
});

test("packageName keeps scopes and strips subpaths", () => {
  assert.equal(packageName("@napi-rs/keyring/index.js"), "@napi-rs/keyring");
  assert.equal(packageName("zod/v4"), "zod");
  assert.equal(packageName("node:fs/promises"), "node:fs/promises");
});

test("eagerChunks follows static imports only", () => {
  const metafile = { outputs: {
    "out/cli.mjs": { imports: [{ kind: "import-statement", path: "out/a.mjs" }, { kind: "dynamic-import", path: "out/lazy.mjs" }] },
    "out/a.mjs": { imports: [{ kind: "import-statement", path: "out/b.mjs" }] },
    "out/b.mjs": { imports: [] }, "out/lazy.mjs": { imports: [] },
  } };
  assert.deepEqual([...eagerChunks(metafile)].sort(), ["out/a.mjs", "out/b.mjs", "out/cli.mjs"]);
});

test("a bundled module resolves sibling assets from its original source location", async () => {
  const root = await mkdtemp(join(tmpdir(), "vanta-bundle-test-"));
  try {
    await mkdir(join(root, "src", "assets"), { recursive: true });
    await writeFile(join(root, "src", "assets", "data.txt"), "hello");
    await writeFile(join(root, "src", "assets", "read.ts"),
      'import { readFileSync } from "node:fs";\nexport const text = readFileSync(new URL("./data.txt", import.meta.url), "utf8");\n');
    await writeFile(join(root, "src", "cli.ts"), 'import { text } from "./assets/read.js";\nconsole.log(text);\n');
    const { entry } = await buildRuntimeBundle({ root });
    const { execFileSync } = await import("node:child_process");
    assert.equal(execFileSync(process.execPath, [entry], { encoding: "utf8" }).trim(), "hello");
    assert.match(await readFile(entry, "utf8"), /__vantaSourceUrl\("src\/assets\/read\.ts"\)/);
    assert.ok(pathToFileURL(entry).href.includes("dist-runtime"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("lazifyImports rewrites namespace, default and named imports and leaves type imports", async () => {
  const { lazifyImports } = await import("./lazy-packages.mjs");
  const source = [
    'import * as ts from "typescript";',
    'import ExcelJS from "exceljs";',
    'import { parseHTML, type Foo as Bar, DOMParser as P } from "linkedom";',
    'import type { Node } from "typescript";',
    'import { other } from "zod";',
  ].join("\n");
  const out = lazifyImports(source);
  assert.match(out, /^import \{ lazyNamespace, lazyMember \} from "vanta:lazy-package-runtime";/);
  assert.match(out, /const ts = lazyNamespace\("typescript"\);/);
  assert.match(out, /const ExcelJS = lazyNamespace\("exceljs", true\);/);
  assert.match(out, /const parseHTML = lazyMember\("linkedom", "parseHTML"\);/);
  assert.match(out, /const P = lazyMember\("linkedom", "DOMParser"\);/);
  assert.match(out, /import type \{ Node \} from "typescript";/);
  assert.match(out, /import \{ other \} from "zod";/);
  assert.equal(lazifyImports('import { z } from "zod";'), 'import { z } from "zod";');
});

test("a lazy package loads on first use, not at startup", async () => {
  const root = await mkdtemp(join(tmpdir(), "vanta-lazy-test-"));
  try {
    await mkdir(join(root, "node_modules", "heavy"), { recursive: true });
    await writeFile(join(root, "node_modules", "heavy", "package.json"), '{"name":"heavy","main":"index.js"}');
    await writeFile(join(root, "node_modules", "heavy", "index.js"),
      'console.log("heavy loaded"); exports.double = (n) => n * 2; exports.Box = class Box { constructor(v) { this.v = v; } };\n');
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src", "cli.ts"), [
      'import { double, Box } from "heavy";',
      'console.log("startup done");',
      'console.log(double(21), new Box(7).v);',
    ].join("\n"));
    const { entry } = await buildRuntimeBundle({ root, lazyPackages: ["heavy"] });
    const { execFileSync } = await import("node:child_process");
    const lines = execFileSync(process.execPath, [entry], { encoding: "utf8" }).trim().split("\n");
    assert.deepEqual(lines, ["startup done", "heavy loaded", "42 7"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
