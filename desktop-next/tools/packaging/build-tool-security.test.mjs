import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { test } from "node:test";
import * as asar from "@electron/asar";
import { FileMatcher } from "app-builder-lib/internal";

const require = createRequire(import.meta.url);
const fixture = t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vanta-build-tools-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
};

test("patched archive matchers preserve dotfiles, links, executable mode and unpacked native bytes", async t => {
  const root = fixture(t), source = path.join(root, "source");
  fs.mkdirSync(path.join(source, "nested"), { recursive: true });
  fs.writeFileSync(path.join(source, ".settings.json"), '{"enabled":true}');
  fs.writeFileSync(path.join(source, "nested/run"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  fs.writeFileSync(path.join(source, "native.node"), "synthetic native bytes");
  fs.symlinkSync("nested/run", path.join(source, "alias"));
  const legacy = createRequire(require.resolve("electron-winstaller"))("@electron/asar");
  for (const [index, packer] of [asar, legacy].entries()) {
    const archive = path.join(root, `app-${index}.asar`), restored = path.join(root, `restored-${index}`);
    await packer.createPackageWithOptions(source, archive, { unpack: "**/*.node" });
    packer.extractAll(archive, restored);
    for (const name of [".settings.json", "nested/run", "native.node", "alias"]) {
      assert.deepEqual(fs.readFileSync(path.join(restored, name)), fs.readFileSync(path.join(source, name)));
    }
    assert.ok(fs.statSync(path.join(restored, "nested/run")).mode & 0o111);
    assert.ok(fs.lstatSync(path.join(restored, "alias")).isSymbolicLink());
    assert.deepEqual(fs.readFileSync(`${archive}.unpacked/native.node`), fs.readFileSync(path.join(source, "native.node")));
  }
});

test("electron-builder include/exclude semantics and legacy matcher consumers stay compatible", () => {
  const filter = new FileMatcher("/fixture", "/output", value => value, ["**/*", "!**/*.secret", "!**/.env"]).createFilter();
  const file = { isDirectory: () => false };
  assert.equal(filter("/fixture/nested/main.js", file), true);
  assert.equal(filter("/fixture/nested/keys.secret", file), false);
  assert.equal(filter("/fixture/.env", file), false);
  const legacy = createRequire(require.resolve("filelist"))("minimatch");
  assert.equal(typeof legacy, "function");
  assert.equal(legacy("a.txt", "{a,b}.txt"), true);
});

test("patched plist XML and build-schema URI handling retain round trips and validation", () => {
  const plist = require("plist");
  const data = { Name: "Vanta <test> & tools", Flag: true, Count: 7, Values: ["one", "two"] };
  assert.deepEqual(plist.parse(plist.build(data)), data);
  const Ajv = createRequire(require.resolve("app-builder-lib"))("ajv");
  const validator = new Ajv().addSchema({ $id: "https://fixture.invalid/common.json", definitions: { label: { type: "string" } } })
    .compile({ $ref: "https://fixture.invalid/common.json#/definitions/label" });
  assert.equal(validator("valid"), true);
  assert.equal(validator(42), false);
});

test("wait-on redirect readiness and both patched Undici majors work over owned loopback HTTP", async t => {
  const requests = [];
  const server = http.createServer((req, res) => {
    requests.push(req.url);
    if (req.url === "/redirect") { res.writeHead(302, { location: "/ready" }); res.end(); }
    else { res.writeHead(200); res.end("ready"); }
  });
  t.after(() => { server.closeAllConnections(); server.close(); });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  await require("wait-on")({ resources: [`http-get://127.0.0.1:${server.address().port}/redirect`], timeout: 4000, interval: 50, window: 0 });
  assert.ok(requests.includes("/redirect") && requests.includes("/ready"));
  const older = createRequire(require.resolve("node-gyp/package.json"))("undici");
  for (const client of [require("undici"), older]) {
    const response = await client.request(`${origin}/ready`);
    assert.equal(response.statusCode, 200);
    assert.equal(await response.body.text(), "ready");
  }
});
