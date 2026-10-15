import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { tsImport } from "../vanta-ts/node_modules/tsx/dist/esm/api/index.mjs";
import {
  validateAutonomyContractText,
  validateCanonicalRoadmap,
  validatePinnedItems,
  validateSourceGuard,
} from "./strategy-realignment-validator-core.mjs";

const repoRoot = resolve(import.meta.dirname, "..");
const { RoadmapSchema } = await tsImport(
  pathToFileURL(resolve(repoRoot, "vanta-ts/src/roadmap/schema.ts")).href,
  import.meta.url,
);
const original = JSON.parse(await readFile(resolve(repoRoot, "roadmap.json"), "utf8"));
const copy = () => structuredClone(original);
const item = (roadmap, id) => roadmap.items.find((entry) => entry.id === id);

test("rejects swapped statuses on new records", () => {
  const roadmap = copy();
  [item(roadmap, "TRUST-02").status, item(roadmap, "TRUST-04").status] =
    [item(roadmap, "TRUST-04").status, item(roadmap, "TRUST-02").status];
  assert.throws(() => validatePinnedItems(roadmap), /exact pinned record differs/);
});

test("rejects self-dependencies and cycles", () => {
  const self = copy();
  item(self, "TRUST-02").after = ["TRUST-02"];
  assert.throws(() => validateCanonicalRoadmap(self, RoadmapSchema), /self-dependency/);

  const cycle = copy();
  item(cycle, "TRUST-02").after = ["TRUST-04"];
  assert.throws(() => validateCanonicalRoadmap(cycle, RoadmapSchema), /dependency cycle/);
});

test("rejects missing required summary and done fields", () => {
  const missingSummary = copy();
  delete item(missingSummary, "TRUST-02").summary;
  assert.throws(() => validateCanonicalRoadmap(missingSummary, RoadmapSchema), /summary/);

  const missingDone = copy();
  delete item(missingDone, "TRUST-02").done;
  assert.throws(() => validateCanonicalRoadmap(missingDone, RoadmapSchema), /done/);
});

test("rejects changed parked date, note, or reason", () => {
  for (const field of ["updated", "notes", "parkedReason"]) {
    const roadmap = copy();
    item(roadmap, "CONNECT-TRELLO-ADAPTER")[field] = `mutated-${field}`;
    assert.throws(() => validatePinnedItems(roadmap), /exact pinned record differs/);
  }
});

test("rejects changed autonomy meaning even when labels remain", async () => {
  const source = await readFile(resolve(repoRoot, "STRATEGY.md"), "utf8");
  const changed = source.replace(
    "R1 — Recommend:** identify the outcome and propose one next action; no mutation.",
    "R1 — Recommend:** silently execute a likely action.",
  );
  assert.throws(() => validateAutonomyContractText(changed, "mutated"), /exact autonomy definition missing/);
});

test("source guard covers unstaged, staged, and committed paths relative to the base", () => {
  for (const path of [
    "vanta-ts/src/unstaged.ts",
    "vanta-ts/src/staged.ts",
    "vanta-ts/src/committed-after-base.ts",
    "scripts/changed-generator.mjs",
    "package-lock.json",
  ]) {
    assert.throws(() => validateSourceGuard([path]), /source guard failed/);
  }
  assert.doesNotThrow(() => validateSourceGuard(["README.md", "docs/report.md"]));
});

test("git diff against the pinned base sees unstaged, staged, and later committed source changes", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "vanta-validator-git-"));
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  try {
    git("init", "-q");
    git("config", "user.email", "validator@example.invalid");
    git("config", "user.name", "Validator Test");
    await mkdir(resolve(root, "vanta-ts/src"), { recursive: true });
    await writeFile(resolve(root, "vanta-ts/src/example.ts"), "export const value = 1;\n");
    git("add", ".");
    git("commit", "-qm", "baseline");
    const base = git("rev-parse", "HEAD");

    await writeFile(resolve(root, "vanta-ts/src/example.ts"), "export const value = 2;\n");
    assert.deepEqual(git("diff", "--name-only", base, "--").split("\n"), ["vanta-ts/src/example.ts"]);

    git("add", "vanta-ts/src/example.ts");
    assert.deepEqual(git("diff", "--name-only", base, "--").split("\n"), ["vanta-ts/src/example.ts"]);

    git("commit", "-qm", "source change");
    const committed = git("diff", "--name-only", base, "--").split("\n");
    assert.deepEqual(committed, ["vanta-ts/src/example.ts"]);
    assert.throws(() => validateSourceGuard(committed), /source guard failed/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
