import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { findAvailablePort, projectArg, resolveProjectRoot, saveProjectSetting } from "./project-root.mjs";

test("projectArg reads an explicit project path", () => {
  assert.equal(projectArg(["--project", "/work/vanta"]), "/work/vanta");
  assert.equal(projectArg([]), undefined);
});

test("resolveProjectRoot prefers explicit input and restores a saved project", async () => {
  const base = await mkdtemp(join(tmpdir(), "vanta-desktop-root-"));
  const explicit = await mkdtemp(join(base, "explicit-"));
  const saved = await mkdtemp(join(base, "saved-"));
  await saveProjectSetting(base, saved);
  assert.equal(await resolveProjectRoot({ args: ["--project", explicit], env: {}, userData: base, cwd: "/missing", home: base }), explicit);
  assert.equal(await resolveProjectRoot({ args: [], env: {}, userData: base, cwd: "/missing", home: base }), saved);
  assert.match(await readFile(join(base, "desktop-settings.json"), "utf8"), /projectRoot/);
});

test("findAvailablePort moves past an occupied port", async () => {
  const net = await import("node:net");
  const occupied = net.createServer();
  await new Promise((resolve) => occupied.listen(0, "127.0.0.1", resolve));
  const address = occupied.address();
  assert.equal(typeof address, "object");
  const next = await findAvailablePort(address.port);
  assert.ok(next > address.port);
  await new Promise((resolve) => occupied.close(resolve));
});
