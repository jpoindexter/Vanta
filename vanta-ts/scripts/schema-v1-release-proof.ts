import { existsSync } from "node:fs";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { join, resolve } from "node:path";
import { chromium } from "playwright-core";
import { createBrowserReleaseDriver, createRepoReleaseDriver } from "../src/schema/release-proof-drivers.js";
import { runSchemaV1ReleaseProof } from "../src/schema/release-proof.js";

const projectRoot = resolve(process.env.VANTA_SCHEMA_RELEASE_PROJECT ?? "..");
const proofParent = join(projectRoot, ".vanta", "release-proofs");
await mkdir(proofParent, { recursive: true });
const proofRoot = await mkdtemp(join(proofParent, "schema-v1-"));
const pagePath = join(proofRoot, "browser-task.html");
await writeFile(pagePath, `<!doctype html>
<meta charset="utf-8">
<title>Vanta Schema release task</title>
<output id="status">pending</output>
<button id="finish" onclick="document.getElementById('status').textContent='done'">Finish</button>
<button id="unexpected" onclick="document.getElementById('status').textContent='unexpected'">Unexpected</button>
`, "utf8");

const systemChrome = process.env.VANTA_CHROME_PATH
  ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await chromium.launch({
  headless: true,
  ...(existsSync(systemChrome) ? { executablePath: systemChrome } : {}),
});
try {
  const page = await browser.newPage();
  const result = await runSchemaV1ReleaseProof({
    root: proofRoot,
    repo: createRepoReleaseDriver(proofRoot),
    browser: createBrowserReleaseDriver(page, pathToFileURL(pagePath).href),
  });
  if (!result.ok) throw new Error(`Schema v1 release proof failed: ${JSON.stringify(result)}`);
  process.stdout.write(`${JSON.stringify({ ...result, proofRoot })}\n`);
} finally {
  await browser.close();
}
