import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
  await mkdir(join(root, "desktop-native"));
  for (const name of ["runtime-fetch-init.mjs", "maintained-fetch.mjs"]) {
    await writeFile(join(root, "desktop-native", name), "export const fixture = true;\n");
  }
  return root;
}

async function buildFixture(root, staging, text) {
  await mkdir(join(staging, "src"), { recursive: true });
  await writeFile(join(staging, "src", "cli.js"), text, "utf8");
  await cp(join(root, "desktop-native"), join(staging, "desktop-native"), { recursive: true });
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test("startup compile survives restart and invalidates on source metadata changes", async () => {
  const root = await fixture();
  let builds = 0;
  const build = async (staging) => {
    builds += 1;
    await buildFixture(root, staging, `export const build = ${builds};\n`);
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
      await buildFixture(root, staging, "export const build = 1;\n");
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

test("fetch helper changes invalidate a warm cache without changing CLI source", async () => {
  const root = await fixture();
  let builds = 0;
  const build = async staging => buildFixture(root, staging, `export const build = ${++builds};\n`);
  const first = await ensureStartupCompile({ root, build });
  for (const name of ["runtime-fetch-init.mjs", "maintained-fetch.mjs"]) {
    await writeFile(join(root, "desktop-native", name), `export const changed = '${name}';\n`);
    assert.equal((await ensureStartupCompile({ root, build })).status, "built");
    assert.match(await readFile(join(first.outputRoot, "desktop-native", name), "utf8"), /changed/);
  }
  assert.equal(builds, 3);
});

test("a missing required fetch output cannot be accepted as a cache hit", async () => {
  const root = await fixture();
  let builds = 0;
  const build = async staging => buildFixture(root, staging, `export const build = ${++builds};\n`);
  const first = await ensureStartupCompile({ root, build });
  for (const name of ["runtime-fetch-init.mjs", "maintained-fetch.mjs"]) {
    await rm(join(first.outputRoot, "desktop-native", name));
    assert.equal((await ensureStartupCompile({ root, build })).status, "built");
    assert.match(await readFile(join(first.outputRoot, "desktop-native", name), "utf8"), /fixture/);
  }
  assert.equal(builds, 3);
});

test("incomplete output is rejected before it replaces a runnable cache", async () => {
  const root = await fixture();
  const first = await ensureStartupCompile({ root, build: staging => buildFixture(root, staging, "export const retained = true;\n") });
  await writeFile(join(root, "src", "cli.ts"), "console.log('trigger rebuild');\n");
  await assert.rejects(ensureStartupCompile({ root, build: async staging => {
    await mkdir(join(staging, "src"), { recursive: true });
    await writeFile(join(staging, "src", "cli.js"), "export const incomplete = true;\n");
  } }), /missing required startup output/);
  assert.match(await readFile(join(first.outputRoot, "src", "cli.js"), "utf8"), /retained/);
  assert.match(await readFile(join(first.outputRoot, "desktop-native", "maintained-fetch.mjs"), "utf8"), /fixture/);
});
