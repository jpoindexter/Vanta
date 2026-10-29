import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { promisify } from "node:util";
import { test } from "node:test";

const exec = promisify(execFile);
const require = createRequire(new URL("../../package.json", import.meta.url));
const entry = require.resolve("yaml");

test("the installed YAML parser matches the declared Desktop pin", async () => {
  const manifest = JSON.parse(await readFile(new URL("../../apps/desktop/package.json", import.meta.url), "utf8"));
  assert.equal(require("yaml/package.json").version, manifest.dependencies.yaml);
});

for (const api of ["parse", "parseDocument", "parseAllDocuments"]) {
  test(`YAML ${api} retains normal input and a typed resource error`, async () => {
    const script = `
      const assert = require("node:assert/strict"), yaml = require(${JSON.stringify(entry)});
      const data = { title: "Research café", enabled: true, steps: ["read", "draft"] };
      assert.deepEqual(yaml.parse(yaml.stringify(data)), data);
      assert.deepEqual(yaml.parse("base: &b {safe: true}\\njob: {<<: *b}", {merge: true}), {base: {safe:true}, job: {safe:true}});
      const payload = "[".repeat(600) + "1" + "]".repeat(600);
      let errors = [];
      try {
        const parsed = yaml[${JSON.stringify(api)}](payload);
        errors = ${JSON.stringify(api)} === "parseAllDocuments" ? parsed.flatMap(doc => doc.errors) : parsed.errors ?? [];
      } catch (error) { errors = [error]; }
      assert.equal(errors.length, 1);
      assert.equal(errors[0].name, "YAMLParseError");
      assert.equal(errors[0].code, "RESOURCE_EXHAUSTION");
    `;
    const result = await exec(process.execPath, ["--stack_size=256", "--max-old-space-size=64", "-e", script], {
      env: { PATH: "/usr/bin:/bin" }, timeout: 4000, maxBuffer: 64 * 1024,
    });
    assert.equal(result.stderr, "");
  });
}
