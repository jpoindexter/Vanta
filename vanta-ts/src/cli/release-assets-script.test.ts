import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const exec = promisify(execFile);
const dirs: string[] = [];
afterEach(async () => Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))));

async function dist(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "vanta-release-assets-"));
  dirs.push(dir);
  return dir;
}

describe("release asset guard script", () => {
  it("refuses to publish without Android/Bionic kernel assets", async () => {
    const dir = await dist();
    await writeFile(join(dir, "vanta-kernel-aarch64-linux-android"), "kernel");
    await expect(exec("bash", ["../scripts/require-release-assets.sh", dir], { cwd: process.cwd() }))
      .rejects.toMatchObject({ stderr: expect.stringContaining("vanta-kernel-aarch64-linux-android.sha256") });
  });

  it("passes when the Android/Bionic kernel and checksum are present", async () => {
    const dir = await dist();
    await writeFile(join(dir, "vanta-kernel-aarch64-linux-android"), "kernel");
    await writeFile(join(dir, "vanta-kernel-aarch64-linux-android.sha256"), "sum");
    const { stdout } = await exec("bash", ["../scripts/require-release-assets.sh", dir], { cwd: process.cwd() });
    expect(stdout).toContain("required release assets present");
  });
});
