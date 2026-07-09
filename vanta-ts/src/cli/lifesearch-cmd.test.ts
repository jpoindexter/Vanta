import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runLifeSearchCommand } from "./lifesearch-cmd.js";

describe("runLifeSearchCommand", () => {
  let tmpHome: string;
  let tmpRepo: string;
  let oldHome: string | undefined;

  beforeEach(async () => {
    tmpHome = await mkdtemp(join(tmpdir(), "vanta-life-cli-home-"));
    tmpRepo = await mkdtemp(join(tmpdir(), "vanta-life-cli-repo-"));
    oldHome = process.env.VANTA_HOME;
    process.env.VANTA_HOME = tmpHome;
    await mkdir(join(tmpRepo, "notes"), { recursive: true });
    await writeFile(
      join(tmpRepo, "notes", "operator.md"),
      "Header\nOperator aesthetics should expose source and state.\n",
      "utf8",
    );
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    if (oldHome === undefined) delete process.env.VANTA_HOME;
    else process.env.VANTA_HOME = oldHome;
    vi.restoreAllMocks();
    rmSync(tmpHome, { recursive: true, force: true });
    rmSync(tmpRepo, { recursive: true, force: true });
  });

  it("prints source-cited hits for a natural-language query", async () => {
    const code = await runLifeSearchCommand(tmpRepo, ["where", "did", "I", "write", "about", "operator", "aesthetics"]);
    expect(code).toBe(0);
    expect(vi.mocked(console.log)).toHaveBeenCalledWith(expect.stringContaining("notes/operator.md:2"));
  });

  it("prints usage and exits nonzero without a query", async () => {
    const code = await runLifeSearchCommand(tmpRepo, []);
    expect(code).toBe(1);
    expect(vi.mocked(console.error)).toHaveBeenCalledWith("Usage: vanta lifesearch <query>");
  });
});
