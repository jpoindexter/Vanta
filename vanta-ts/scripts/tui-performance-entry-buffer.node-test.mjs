import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const agentDir = resolve(scriptsDir, "..");
const repoRoot = resolve(agentDir, "..");

test("shipped TUI launchers select the production React reconciler", async () => {
  const [runScript, packageJson] = await Promise.all([
    readFile(resolve(repoRoot, "run.sh"), "utf8"),
    readFile(resolve(agentDir, "package.json"), "utf8").then(JSON.parse),
  ]);

  assert.match(
    runScript,
    /export NODE_ENV="\$\{NODE_ENV:-production\}"/,
    "run.sh must default NODE_ENV before Node imports Ink",
  );
  assert.match(
    packageJson.scripts.vanta,
    /^NODE_ENV=production node --import tsx /,
    "npm run vanta must import Ink with the production reconciler",
  );
});

test("production Ink renders do not retain performance measures", () => {
  const probe = `
    import React from "react";
    import { render, Text } from "ink";
    import { PassThrough } from "node:stream";

    const stdout = new PassThrough();
    stdout.isTTY = false;
    const instance = render(React.createElement(Text, null, "0"), {
      stdout,
      stdin: process.stdin,
      exitOnCtrlC: false,
      patchConsole: false,
    });
    for (let index = 1; index <= 1_000; index += 1) {
      instance.rerender(React.createElement(Text, null, String(index)));
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
    const measures = performance.getEntriesByType("measure").length;
    instance.unmount();
    console.log(JSON.stringify({ measures }));
  `;
  const result = spawnSync(
    process.execPath,
    ["--input-type=module", "--eval", probe],
    {
      cwd: agentDir,
      env: { ...process.env, NODE_ENV: "production" },
      encoding: "utf8",
      timeout: 15_000,
    },
  );

  assert.equal(result.status, 0, result.stderr);
  const evidence = JSON.parse(result.stdout.trim());
  assert.equal(evidence.measures, 0);
});
