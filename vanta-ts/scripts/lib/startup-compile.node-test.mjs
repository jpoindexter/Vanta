import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureStartupCompile } from "./startup-compile.mjs";

const roots = [];

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "vanta-startup-compile-"));
  roots.push(root);
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(join(root, "src", "cli.ts"), "console.log('one');\n", "utf8");
  await writeFile(join(root, "package.json"), "{}\n", "utf8");
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test("startup compile survives restart and invalidates on source metadata changes", async () => {
  const root = await fixture();
  let builds = 0;
  const build = async (staging) => {
    builds += 1;
    await mkdir(join(staging, "src"), { recursive: true });
    await writeFile(join(staging, "src", "cli.js"), `export const build = ${builds};\n`, "utf8");
  };

  assert.equal((await ensureStartupCompile({ root, build })).status, "built");
  assert.equal((await ensureStartupCompile({ root, build })).status, "hit");
  assert.equal(builds, 1);

  await writeFile(join(root, "src", "cli.ts"), "console.log('changed source');\n", "utf8");
  assert.equal((await ensureStartupCompile({ root, build })).status, "built");
  assert.equal(builds, 2);
});

test("invalid manifest rebuilds and a failed rebuild preserves the last runnable artifact", async () => {
  const root = await fixture();
  const first = await ensureStartupCompile({
    root,
    build: async (staging) => {
      await mkdir(join(staging, "src"), { recursive: true });
      await writeFile(join(staging, "src", "cli.js"), "export const build = 1;\n", "utf8");
    },
  });
  await writeFile(join(first.outputRoot, "manifest.json"), "{broken", "utf8");
  await assert.rejects(ensureStartupCompile({
    root,
    build: async () => {
      throw new Error("compiler crashed");
    },
  }), /compiler crashed/);
  assert.match(await readFile(join(first.outputRoot, "src", "cli.js"), "utf8"), /build = 1/);
});
