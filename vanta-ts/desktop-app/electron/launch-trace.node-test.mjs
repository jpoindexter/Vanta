import assert from "node:assert/strict";
import test from "node:test";
import { createLaunchTrace, formatRendererMarks } from "./launch-trace.mjs";

test("trace is silent unless VANTA_LAUNCH_TRACE=1", () => {
  const lines = [];
  createLaunchTrace({ env: {}, write: (line) => lines.push(line) })("window created");
  assert.deepEqual(lines, []);
});

test("trace prints the stage with epoch and uptime ms", () => {
  const lines = [];
  createLaunchTrace({ env: { VANTA_LAUNCH_TRACE: "1" }, now: () => 1000, uptime: () => 0.25, write: (line) => lines.push(line) })("app ready");
  assert.deepEqual(lines, ["[launch:main] app ready epoch=1000 up=250\n"]);
});

test("renderer marks become epoch ms lines and unrelated entries are dropped", () => {
  const lines = formatRendererMarks([
    { name: "vanta:first-render", startTime: 120.4 },
    { name: "first-contentful-paint", startTime: 90 },
    { name: "something-else", startTime: 5 },
  ], 5000);
  assert.deepEqual(lines, ["[launch:renderer] first-render epoch=5120", "[launch:renderer] first-contentful-paint epoch=5090"]);
});
