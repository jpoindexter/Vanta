import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const website = new URL("../package.json", import.meta.url);
const require = createRequire(createRequire(website).resolve("@docusaurus/core/package.json"));
const entry = process.env.VANTA_WORKER_TEST_ENTRY ?? require.resolve("tinypool");
const exec = promisify(execFile);

test("Docusaurus resolves the exact reviewed worker override", async () => {
  const manifest = JSON.parse(await readFile(website, "utf8"));
  assert.equal(manifest.overrides["@docusaurus/core@3.10.2"].tinypool, "2.1.2");
  if (!process.env.VANTA_WORKER_TEST_ENTRY) assert.equal(require("tinypool/package.json").version, "2.1.2");
});

async function fixture() {
  const directory = await mkdtemp(path.join(tmpdir(), "vanta-worker-security-"));
  const legitimate = path.join(directory, "legitimate.mjs");
  const alternate = path.join(directory, "alternate.mjs"), preload = path.join(directory, "preload.cjs");
  await writeFile(legitimate, 'export default task => ({ by: "legitimate", value: task.value * 2, preload: globalThis.__vantaWorkerProbe === true });\n');
  await writeFile(alternate, 'export default () => ({ by: "substitute" });\n');
  await writeFile(preload, "globalThis.__vantaWorkerProbe = true;\n");
  return { directory, legitimate, alternate, preload };
}

for (const vector of ["execArgv", "env", "filename"]) {
  test(`worker options ignore inherited ${vector}`, async () => {
    const files = await fixture();
    try {
      const script = `
        import Tinypool from ${JSON.stringify(pathToFileURL(entry).href)};
        const files = ${JSON.stringify(files)}, vector = ${JSON.stringify(vector)};
        const value = vector === "filename" ? files.alternate : vector === "env"
          ? { NODE_OPTIONS: "--require=" + files.preload } : ["--require", files.preload];
        Object.defineProperty(Object.prototype, vector, { value, configurable: true, writable: true });
        let pool;
        try {
          pool = new Tinypool({ filename: files.legitimate, minThreads: 1, maxThreads: 1,
            runtime: "worker_threads", concurrentTasksPerWorker: 1, isolateWorkers: false });
          const result = await pool.run({ value: 21 }, {});
          console.log(JSON.stringify(result));
        } finally { delete Object.prototype[vector]; await pool?.destroy(); }
      `;
      const probe = path.join(files.directory, "probe.mjs");
      await writeFile(probe, script);
      const result = await exec(process.execPath, [probe], {
        env: { PATH: "/usr/bin:/bin" }, timeout: 10000, maxBuffer: 64 * 1024,
      });
      assert.equal(result.stderr, "");
      assert.deepEqual(JSON.parse(result.stdout), { by: "legitimate", value: 42, preload: false });
    } finally { await rm(files.directory, { recursive: true, force: true }); }
  });
}

test("Docusaurus-shaped pooled tasks retain queueing and recycling", async () => {
  const files = await fixture();
  const { default: Tinypool } = await import(pathToFileURL(entry).href);
  const pool = new Tinypool({ filename: files.legitimate, minThreads: 2, maxThreads: 2,
    runtime: "worker_threads", concurrentTasksPerWorker: 1, isolateWorkers: false,
    workerData: { params: { site: "fixture" } }, maxMemoryLimitBeforeRecycle: 1000000000 });
  try {
    assert.deepEqual((await Promise.all([1, 2, 3, 4].map(value => pool.run({ value })))).map(row => row.value), [2, 4, 6, 8]);
    await pool.recycleWorkers();
    assert.equal((await pool.run({ value: 5 })).value, 10);
  } finally { await pool.destroy(); await rm(files.directory, { recursive: true, force: true }); }
});
