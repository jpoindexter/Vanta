import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(new URL("../apps/desktop/package.json", import.meta.url));
const { MockerRegistry } = await import(require.resolve("@vitest/mocker"));
const { createManualModuleSource, interceptorPlugin } = await import(require.resolve("@vitest/mocker/node"));
const { resolveConfig } = await import(require.resolve("vite"));

test("manual mock URLs and export names stay serialized data in generated source", () => {
  const url = 'x"); globalThis.mockEscape = 1; void("';
  const name = 'quoted"export\nname';
  const source = createManualModuleSource(url, [name]);
  assert.ok(source.includes(`getFactoryModule(${JSON.stringify(url)})`));
  assert.ok(source.includes(`__factoryModule__[${JSON.stringify(name)}]`));
  assert.ok(source.includes(`resolvedModule[${JSON.stringify(name)}]`));
});

test("ordinary manual mock generation retains its factory and named export", () => {
  const source = createManualModuleSource("/safe-module.js", ["ordinary"]);
  assert.ok(source.includes('getFactoryModule("/safe-module.js")'));
  assert.ok(source.includes('export { __0 as "ordinary" }'));
});

test("redirect registration rejects paths outside Vite's file-serving boundary", async () => {
  const registry = new MockerRegistry();
  const events = new Map();
  const config = await resolveConfig({
    configFile: false, envDir: false, root: process.cwd(),
    server: { fs: { strict: true, allow: [process.cwd()], deny: [] } },
  }, "serve");
  interceptorPlugin({ registry }).configureServer({
    config, ws: { on: (name, callback) => events.set(name, callback), send: () => {} },
  });
  const register = (id, redirect) => events.get("vitest:interceptor:register")({
    type: "redirect", raw: id, id, url: id, redirect,
  });
  register("/outside-proof", "local:../../outside-do-not-read");
  assert.equal(registry.getById("/outside-proof"), undefined);
  register("/inside-proof", "file:///inside-do-not-read.js");
  assert.ok(registry.getById("/inside-proof"));
});
