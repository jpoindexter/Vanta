import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { results } from "./kit.mjs";
import { projectLaneRows } from "./project-lanes.mjs";

for (const badRow of [0, 1]) {
  test(`F-048 cannot pass when fixture ${badRow + 1} has no folder`, async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vanta-f048-negative-"));
    const project = path.join(root, "acme"), second = path.join(root, "beta");
    const rows = [
      { title: "Review the Acme landing page", cwd: project },
      { title: "Draft the Beta notes", cwd: second },
      { title: "Unfiled project-lane fixture" }
    ];
    delete rows[badRow].cwd;
    const replies = [{ projects: [{ name: "Beta notes", path: second }] }, rows];
    const ready = { first() { return this; }, waitFor: async () => undefined };
    const page = {
      evaluate: async () => replies.shift(),
      locator: () => ready,
      reload: async () => undefined,
      waitForTimeout: async () => undefined
    };
    results.clear();
    await assert.rejects(projectLaneRows({ root, project, second, page }), /chat carries its actual folder/);
    assert.notEqual(results.get("F-048")?.result, "PASS");
  });
}
