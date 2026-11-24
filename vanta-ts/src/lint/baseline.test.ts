import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildBaseline, GROWTH_ALLOWANCE_LINES, isDataFile, readBaseline, worsened, writeBaseline } from "./baseline.js";
import { runLint } from "./run.js";
import type { Violation } from "./size.js";

const ROOT = "/repo";
const v = (file: string, kind: Violation["kind"], actual: number, limit = 50): Violation => ({
  file: `${ROOT}/${file}`, line: 1, kind, actual, limit, fix: "fix",
});

describe("isDataFile", () => {
  it("exempts locale tables and generated code, not logic next to them", () => {
    expect(isDataFile("desktop-next/apps/desktop/src/i18n/fr.ts")).toBe(true);
    expect(isDataFile("desktop-next/apps/desktop/src/i18n/pt-BR.ts")).toBe(true);
    expect(isDataFile("desktop-next/apps/desktop/src/i18n/ar_chat.ts")).toBe(true);
    expect(isDataFile("desktop-next/apps/desktop/src/gateway-contract.generated.ts")).toBe(true);
    expect(isDataFile("desktop-next/apps/desktop/src/i18n/index.ts")).toBe(false);
    expect(isDataFile("vanta-ts/src/lint/size.ts")).toBe(false);
  });
});

describe("buildBaseline", () => {
  it("records line count for oversized files and a count per other kind, keyed relative to the root", () => {
    const base = buildBaseline(ROOT, [v("a.ts", "file", 340, 300), v("a.ts", "function", 70), v("a.ts", "function", 55), v("b.ts", "complexity", 14, 10)]);
    expect(base).toEqual({ "a.ts": { lines: 340, function: 2 }, "b.ts": { complexity: 1 } });
  });
});

describe("worsened", () => {
  const baseline = { "a.ts": { lines: 340, function: 2 } };

  it("passes a file that is no worse than its baseline", () => {
    expect(worsened(ROOT, [v("a.ts", "file", 340, 300), v("a.ts", "function", 70), v("a.ts", "function", 55)], baseline)).toEqual([]);
  });

  it("passes growth within the allowance and blocks beyond it", () => {
    expect(worsened(ROOT, [v("a.ts", "file", 340 + GROWTH_ALLOWANCE_LINES, 300)], baseline)).toEqual([]);
    expect(worsened(ROOT, [v("a.ts", "file", 341 + GROWTH_ALLOWANCE_LINES, 300)], baseline)).toHaveLength(1);
  });

  it("blocks a new violating function in a baselined file", () => {
    const found = worsened(ROOT, [v("a.ts", "function", 70), v("a.ts", "function", 55), v("a.ts", "function", 51)], baseline);
    expect(found).toHaveLength(3);
  });

  it("blocks a kind the baseline never recorded for that file", () => {
    expect(worsened(ROOT, [v("a.ts", "params", 6, 4)], baseline)).toHaveLength(1);
  });

  it("blocks every violation in a file with no baseline entry", () => {
    expect(worsened(ROOT, [v("new.ts", "file", 310, 300), v("new.ts", "function", 60)], baseline)).toHaveLength(2);
  });
});

describe("baseline file", () => {
  let dir: string;
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "size-baseline-")); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  it("round-trips, sorted by path", async () => {
    const path = join(dir, "b.json");
    await writeBaseline(path, { "z.ts": { lines: 400 }, "a.ts": { function: 1 } });
    expect(Object.keys((await readBaseline(path)) ?? {})).toEqual(["a.ts", "z.ts"]);
  });

  it("returns null for a missing or malformed file, so the strict gate applies", async () => {
    expect(await readBaseline(join(dir, "missing.json"))).toBeNull();
    await writeFile(join(dir, "bad.json"), '{"a.ts": {"lines": "many"}}');
    expect(await readBaseline(join(dir, "bad.json"))).toBeNull();
  });
});

describe("runLint with --baseline", () => {
  let dir: string;
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "size-run-")); vi.spyOn(console, "log").mockImplementation(() => undefined); });
  afterEach(async () => { vi.restoreAllMocks(); await rm(dir, { recursive: true, force: true }); });

  const lines = (n: number) => Array.from({ length: n }, (_, i) => `export const v${i} = ${i};`).join("\n");

  it("blocks an oversized file strictly, passes it once recorded, and blocks it again when it grows too far", async () => {
    const file = join(dir, "big.ts");
    const baselinePath = join(dir, "base.json");
    await writeFile(file, lines(320));

    expect(await runLint(dir, [file])).toBe(1);
    expect(await runLint(dir, [file, `--baseline=${baselinePath}`])).toBe(1);

    expect(await runLint(dir, [file, "--write-baseline", `--baseline=${baselinePath}`])).toBe(0);
    expect(await runLint(dir, [file, `--baseline=${baselinePath}`])).toBe(0);

    await writeFile(file, lines(320 + GROWTH_ALLOWANCE_LINES + 1));
    expect(await runLint(dir, [file, `--baseline=${baselinePath}`])).toBe(1);
  });
});

describe("runLint --staged (the commit hook)", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "size-staged-"));
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const git = (...args: string[]) => execFileSync("git", ["-C", dir, ...args], { stdio: "ignore" });
    git("init", "-q");
    git("config", "user.email", "t@example.test");
    git("config", "user.name", "T");
  });
  afterEach(async () => { vi.restoreAllMocks(); await rm(dir, { recursive: true, force: true }); });

  const lines = (n: number) => Array.from({ length: n }, (_, i) => `export const v${i} = ${i};`).join("\n");
  const stage = (...paths: string[]) => execFileSync("git", ["-C", dir, "add", ...paths], { stdio: "ignore" });

  it("uses the repo baseline on its own, and --strict opts out", async () => {
    await writeFile(join(dir, "big.ts"), lines(320));
    stage("big.ts");
    expect(await runLint(dir, ["--staged"])).toBe(1);

    expect(await runLint(dir, ["--write-baseline"])).toBe(0);
    expect(await runLint(dir, ["--staged"])).toBe(0);
    expect(await runLint(dir, ["--staged", "--strict"])).toBe(1);

    await writeFile(join(dir, "big.ts"), lines(320 + GROWTH_ALLOWANCE_LINES + 1));
    stage("big.ts");
    expect(await runLint(dir, ["--staged"])).toBe(1);
  });

  it("blocks a new oversized file even when a baseline exists", async () => {
    await writeFile(join(dir, "old.ts"), lines(320));
    stage("old.ts");
    expect(await runLint(dir, ["--write-baseline"])).toBe(0);
    await writeFile(join(dir, "fresh.ts"), lines(310));
    stage("fresh.ts");
    expect(await runLint(dir, ["--staged"])).toBe(1);
  });
});
