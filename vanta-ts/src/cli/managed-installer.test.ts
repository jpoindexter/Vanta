import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const bootstrap = join(repoRoot, "scripts", "bootstrap-install.sh");

describe("managed runtime installer", () => {
  let root: string;
  let source: string;
  let home: string;
  let install: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "vanta-managed-installer-"));
    source = join(root, "source");
    home = join(root, "home");
    install = join(home, "app");
    await exec("git", ["init", "--initial-branch=main", source]);
    await exec("git", ["-C", source, "config", "user.email", "test@example.com"]);
    await exec("git", ["-C", source, "config", "user.name", "Vanta test"]);
    await writeFile(join(source, "install.sh"), `#!/usr/bin/env bash
set -e
mkdir -p "$VANTA_HOME"
printf '%s\\n' "$PWD" > "$VANTA_HOME/delegated-from"
`, "utf8");
    await writeFile(join(source, "README.md"), "fixture\n", "utf8");
    await chmod(join(source, "install.sh"), 0o755);
    await exec("git", ["-C", source, "add", "."]);
    await exec("git", ["-C", source, "commit", "-m", "fixture"]);
  });

  afterEach(async () => { await rm(root, { recursive: true, force: true }); });

  async function run(...args: string[]) {
    return exec("bash", [bootstrap, "--repo", source, "--branch", "main", "--dir", install, "--vanta-home", home, "--non-interactive", ...args]);
  }

  it("clones a managed runtime and delegates setup with the selected Vanta home", async () => {
    await run();
    expect((await readFile(join(home, "delegated-from"), "utf8")).trim()).toBe(install);
    expect((await exec("git", ["-C", install, "rev-parse", "--is-inside-work-tree"])).stdout.trim()).toBe("true");
  });

  it("updates a clean managed runtime on rerun", async () => {
    await run();
    await writeFile(join(source, "README.md"), "updated\n", "utf8");
    await exec("git", ["-C", source, "add", "README.md"]);
    await exec("git", ["-C", source, "commit", "-m", "update fixture"]);

    await run();
    expect(await readFile(join(install, "README.md"), "utf8")).toBe("updated\n");
  });

  it("does not overwrite a dirty managed runtime", async () => {
    await run();
    await writeFile(join(install, "README.md"), "local edit\n", "utf8");
    await writeFile(join(source, "README.md"), "upstream update\n", "utf8");
    await exec("git", ["-C", source, "add", "README.md"]);
    await exec("git", ["-C", source, "commit", "-m", "upstream update"]);

    const result = await run();
    expect(result.stdout).toContain("local changes; leaving its checkout untouched");
    expect(await readFile(join(install, "README.md"), "utf8")).toBe("local edit\n");
  });

  it("has a public raw-installer handoff in the checkout installer", async () => {
    const installer = await readFile(join(repoRoot, "install.sh"), "utf8");
    expect(installer).toContain("bootstrap-install.sh");
    expect(installer).toContain("curl -fsSL");
  });

  it("routes a standalone public installer through the managed bootstrap", async () => {
    const rawInstaller = join(root, "install.sh");
    await writeFile(rawInstaller, await readFile(join(repoRoot, "install.sh"), "utf8"), "utf8");
    await chmod(rawInstaller, 0o755);

    await exec(
      "bash",
      [rawInstaller, "--repo", source, "--branch", "main", "--dir", install, "--vanta-home", home, "--non-interactive"],
      { env: { ...process.env, VANTA_BOOTSTRAP_URL: `file://${bootstrap}` } },
    );

    expect((await readFile(join(home, "delegated-from"), "utf8")).trim()).toBe(install);
  });
});
