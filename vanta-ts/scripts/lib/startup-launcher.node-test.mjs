import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

const exec = promisify(execFile);
const repository = resolve(import.meta.dirname, "../../..");

async function launcherFixture(root) {
  const runtime = join(root, "vanta-ts");
  await mkdir(join(root, "scripts"), { recursive: true });
  await mkdir(join(root, "target/debug"), { recursive: true });
  await mkdir(join(runtime, "scripts/lib"), { recursive: true });
  await mkdir(join(runtime, "src"));
  await mkdir(join(runtime, "desktop-native"));
  for (const file of ["run.sh", "scripts/setup-lib.sh", "scripts/install-events.sh"]) {
    await cp(join(repository, file), join(root, file));
  }
  await cp(join(import.meta.dirname, "startup-compile.mjs"), join(runtime, "scripts/lib/startup-compile.mjs"));
  await symlink(join(repository, "vanta-ts/node_modules"), join(runtime, "node_modules"));
  await writeFile(join(root, "target/debug/vanta-kernel"), "#!/bin/sh\nexit 1\n", { mode: 0o700 });
  await writeFile(join(runtime, "package.json"), '{"type":"module"}\n');
  for (const name of ["runtime-fetch-init.mjs", "maintained-fetch.mjs"]) await writeFile(join(runtime, "desktop-native", name), "");
  // Copy-only compiler fixture isolates the shipped launcher's process/reload contract.
  await writeFile(join(runtime, "scripts/ensure-startup-compile.mjs"), `
import { cp, mkdir } from "node:fs/promises";
import { ensureStartupCompile } from "./lib/startup-compile.mjs";
const result = await ensureStartupCompile({ root: process.cwd(), build: async target => {
  await mkdir(target + "/src");
  await cp("src/cli.ts", target + "/src/cli.js");
  await cp("package.json", target + "/package.json");
  await cp("desktop-native", target + "/desktop-native", { recursive: true });
}});
console.log(result.outputRoot);
`);
  return runtime;
}

test("the shipped launcher refreshes its pinned generation on exit 75, including paths with spaces", async () => {
  const root = await mkdtemp(join(tmpdir(), "vanta launcher-"));
  try {
    const runtime = await launcherFixture(root);
    await writeFile(join(runtime, "src/cli.ts"), `
import { writeFileSync } from "node:fs";
console.log("first=" + import.meta.url);
writeFileSync("src/cli.ts", ${JSON.stringify('console.log("second=" + import.meta.url);\n')});
process.exit(75);
`);
    const { stdout, stderr } = await exec("/bin/sh", [join(root, "run.sh")], {
      cwd: root, timeout: 15000,
      env: { PATH: `${dirname(process.execPath)}:/usr/bin:/bin`, HOME: root, VANTA_HOME: join(root, "home"), VANTA_ROOT: root },
    });
    const lines = stdout.trim().split("\n");
    assert.equal(lines.length, 2);
    assert.match(lines[0], /first=.*\.startup-cache\/generation-[A-Za-z0-9]+\/src\/cli\.js/);
    assert.match(lines[1], /second=.*\.startup-cache\/generation-[A-Za-z0-9]+\/src\/cli\.js/);
    assert.notEqual(lines[0].slice(6), lines[1].slice(7));
    assert.equal(stderr, "vanta: reloading…\n");
    const generation = JSON.parse(await readFile(join(runtime, ".startup-cache/current.json"), "utf8"));
    assert(lines[1].includes(generation));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a compiler failure retains the shipped source-loader fallback", async () => {
  const root = await mkdtemp(join(tmpdir(), "vanta fallback-"));
  try {
    const runtime = await launcherFixture(root);
    await writeFile(join(runtime, "scripts/ensure-startup-compile.mjs"), 'throw new Error("compiler failure fixture");\n');
    await writeFile(join(runtime, "src/cli.ts"), 'console.log("fallback=" + import.meta.url);\n');
    const result = await exec("/bin/sh", [join(root, "run.sh")], {
      cwd: root, timeout: 15000,
      env: { PATH: `${dirname(process.execPath)}:/usr/bin:/bin`, HOME: root, VANTA_HOME: join(root, "home"), VANTA_ROOT: root },
    });
    assert.match(result.stdout, /fallback=.*\/vanta-ts\/src\/cli\.ts/);
    assert.equal(result.stderr, "");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
