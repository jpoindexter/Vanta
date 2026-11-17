import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import * as ts from "typescript";

const exec = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

test("TypeScript 7 compiles while the TypeScript 6 API remains available", async () => {
  const compiler = join(root, "node_modules", "@typescript", "native", "bin", "tsc");
  const { stdout } = await exec(process.execPath, [compiler, "--version"], { cwd: root });

  assert.match(stdout.trim(), /^Version 7\.0\./);
  assert.match(ts.version, /^6\.0\./);
  const source = ts.createSourceFile("fixture.ts", "const answer: number = 42;", ts.ScriptTarget.Latest, true);
  assert.equal(source.statements.length, 1);
});
