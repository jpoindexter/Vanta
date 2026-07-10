import { execFile } from "node:child_process";
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const exec = promisify(execFile);
const dirs: string[] = [];
afterEach(async () => Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))));

describe("Termux install/runtime path", () => {
  it("the physical ARM64 proof script refuses non-Termux hosts", async () => {
    const script = join(process.cwd(), "..", "scripts", "termux-arm64-device-proof.sh");
    await exec("bash", ["-n", script]);
    await expect(exec("bash", [script], {
      env: { ...process.env, TERMUX_VERSION: "", PREFIX: "" },
      timeout: 20_000,
    })).rejects.toMatchObject({
      stderr: expect.stringContaining("requires a real Termux shell"),
    });
  });

  it("the real installer uses the native toolchain, lifecycle-safe deps, and PREFIX/bin", async () => {
    const fixture = await installerFixture();
    const { stdout } = await exec("bash", [join(fixture.root, "install.sh")], { env: fixture.env, timeout: 20_000 });
    const calls = await readFile(fixture.log, "utf8");

    expect(stdout).toContain("Termux detected");
    expect(stdout).toContain("building the Android-native safety kernel");
    expect(calls).toContain("pkg install -y curl git nodejs-lts python esbuild");
    expect(calls).toContain("pkg install -y rust make clang pkg-config");
    expect(calls).toContain("cargo build");
    expect(calls).toContain("npm build_from_source=false install --omit=dev --omit=optional --ignore-scripts");
    expect(calls).toContain("vanta-kernel-aarch64-linux-android");
    await expect(readFile(join(fixture.prefix, "bin", "vanta"), "utf8")).resolves.toContain("Vanta global launcher");
    await expect(readFile(join(fixture.root, "target", "debug", "vanta-kernel"), "utf8")).resolves.toContain("exit 0");
  });

  it("can require a prebuilt Android kernel and refuse source-build fallback", async () => {
    const fixture = await installerFixture();
    await expect(exec("bash", [join(fixture.root, "install.sh")], {
      env: { ...fixture.env, VANTA_REQUIRE_PREBUILT_KERNEL: "1" },
      timeout: 20_000,
    })).rejects.toMatchObject({
      stdout: expect.stringContaining("prebuilt kernel required but unavailable"),
    });
    const calls = await readFile(fixture.log, "utf8");
    expect(calls).not.toContain("cargo build");
  });

  it("the real run.sh exports the Termux platform and phone heap default", async () => {
    const root = await tempDir("run");
    const home = join(root, "home");
    const prefix = join(root, "prefix");
    const fakeBin = join(root, "fake-bin");
    await mkdir(join(root, "scripts"), { recursive: true });
    await mkdir(join(root, "target", "debug"), { recursive: true });
    await mkdir(join(root, "vanta-ts", "node_modules", "tsx"), { recursive: true });
    await mkdir(fakeBin, { recursive: true });
    await copyFile(join(process.cwd(), "..", "run.sh"), join(root, "run.sh"));
    await copyFile(join(process.cwd(), "..", "scripts", "setup-lib.sh"), join(root, "scripts", "setup-lib.sh"));
    await copyFile(join(process.cwd(), "..", "scripts", "install-events.sh"), join(root, "scripts", "install-events.sh"));
    await writeExecutable(join(root, "target", "debug", "vanta-kernel"), "#!/bin/sh\nexit 0\n");
    await writeExecutable(join(fakeBin, "node"), NODE_FIXTURE);
    await chmod(join(root, "run.sh"), 0o755);

    const { stdout } = await exec(join(root, "run.sh"), ["--help"], { env: {
      ...process.env,
      HOME: home,
      PREFIX: prefix,
      TERMUX_VERSION: "0.118",
      PATH: `${fakeBin}:${process.env.PATH}`,
      NODE_OPTIONS: "",
    } });
    expect(stdout).toContain("termux|--max-old-space-size=1536|--import tsx src/cli.ts --help");
  });

  it("shared helpers refuse GNU Node/kernel downloads under Termux", async () => {
    const helper = join(process.cwd(), "..", "scripts", "setup-lib.sh");
    const script = `
      . "$HELPER"
      uname() { [ "\${1:-}" = "-m" ] && echo x86_64 || echo Linux; }
      curl() { echo curl-called; return 9; }
      if vanta_ensure_node; then echo node-ok; else echo node-native-required; fi
      if vanta_fetch_prebuilt_kernel "$ROOT"; then echo kernel-ok; else echo kernel-native-required; fi
      vanta_platform_name
    `;
    const { stdout } = await exec("sh", ["-c", script], { env: {
      TERMUX_VERSION: "0.118",
      PREFIX: "/data/data/com.termux/files/usr",
      PATH: "/usr/bin:/bin",
      HELPER: helper,
      ROOT: await tempDir("helpers"),
    } });
    expect(stdout).toContain("node-native-required");
    expect(stdout).toContain("kernel-native-required");
    expect(stdout).toContain("termux");
    expect(stdout).not.toContain("curl-called");
  });

  it("downloads and checksum-verifies the Android/Bionic kernel on ARM64 Termux", async () => {
    const helper = join(process.cwd(), "..", "scripts", "setup-lib.sh");
    const root = await tempDir("arm64-kernel");
    const script = `
      . "$HELPER"
      uname() { [ "\${1:-}" = "-m" ] && echo aarch64 || echo Linux; }
      curl() {
        url=""; out=""
        while [ "$#" -gt 0 ]; do
          case "$1" in -o) out="$2"; shift 2 ;; http*) url="$1"; shift ;; *) shift ;; esac
        done
        echo "$url" >> "$CALL_LOG"
        case "$url" in
          *.sha256) printf '%s  vanta-kernel-aarch64-linux-android\\n' "$(printf android-kernel | sha256sum | awk '{print $1}')" > "$out" ;;
          *) printf android-kernel > "$out" ;;
        esac
      }
      vanta_fetch_prebuilt_kernel "$ROOT"
    `;
    const log = join(root, "downloads.log");
    await exec("sh", ["-c", script], { env: {
      ...process.env,
      TERMUX_VERSION: "0.118",
      PREFIX: "/data/data/com.termux/files/usr",
      HELPER: helper,
      ROOT: root,
      CALL_LOG: log,
    } });
    await expect(readFile(join(root, "target", "debug", "vanta-kernel"), "utf8")).resolves.toBe("android-kernel");
    await expect(readFile(log, "utf8")).resolves.toContain("vanta-kernel-aarch64-linux-android");
  });

  it("rejects an ARM64 Android kernel when its release checksum does not match", async () => {
    const helper = join(process.cwd(), "..", "scripts", "setup-lib.sh");
    const root = await tempDir("arm64-bad-sum");
    const script = `
      . "$HELPER"
      uname() { [ "\${1:-}" = "-m" ] && echo aarch64 || echo Linux; }
      curl() {
        out=""
        while [ "$#" -gt 0 ]; do
          case "$1" in -o) out="$2"; shift 2 ;; *) shift ;; esac
        done
        case "$out" in */sum) printf '%064d  kernel\\n' 0 > "$out" ;; *) printf tampered > "$out" ;; esac
      }
      if vanta_fetch_prebuilt_kernel "$ROOT"; then exit 9; fi
      test ! -e "$ROOT/target/debug/vanta-kernel"
    `;
    await exec("sh", ["-c", script], { env: {
      ...process.env,
      TERMUX_VERSION: "0.118",
      PREFIX: "/data/data/com.termux/files/usr",
      HELPER: helper,
      ROOT: root,
    } });
  });
});

async function tempDir(name: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), `vanta-termux-${name}-`));
  dirs.push(dir);
  return dir;
}

async function writeExecutable(path: string, content: string): Promise<void> {
  await writeFile(path, content, "utf8");
  await chmod(path, 0o755);
}

async function installerFixture(): Promise<{ root: string; prefix: string; log: string; env: NodeJS.ProcessEnv }> {
  const root = await tempDir("install");
  const home = join(root, "home");
  const prefix = join(root, "prefix");
  const fakeBin = join(root, "fake-bin");
  const log = join(root, "calls.log");
  await mkdir(join(root, "scripts"), { recursive: true });
  await mkdir(join(root, "vanta-ts"), { recursive: true });
  await mkdir(join(prefix, "bin"), { recursive: true });
  await mkdir(fakeBin, { recursive: true });
  await copyFile(join(process.cwd(), "..", "install.sh"), join(root, "install.sh"));
  await copyFile(join(process.cwd(), "..", "scripts", "setup-lib.sh"), join(root, "scripts", "setup-lib.sh"));
  await writeFile(join(root, "Cargo.toml"), "[package]\nname='fixture'\nversion='0.0.0'\n", "utf8");
  await writeFile(join(root, "vanta-ts", "package.json"), "{}\n", "utf8");
  await writeExecutable(join(root, "run.sh"), "#!/bin/sh\nexit 0\n");
  await writeExecutable(join(fakeBin, "pkg"), '#!/bin/sh\necho "pkg $*" >> "$CALL_LOG"\n');
  await writeExecutable(join(fakeBin, "uname"), '#!/bin/sh\nif [ "${1:-}" = "-m" ]; then echo aarch64; else echo Linux; fi\n');
  await writeExecutable(join(fakeBin, "cargo"), CARGO_FIXTURE);
  await writeExecutable(join(fakeBin, "npm"), '#!/bin/sh\necho "npm build_from_source=${npm_config_build_from_source:-false} $*" >> "$CALL_LOG"\nmkdir -p node_modules\n');
  await writeExecutable(join(fakeBin, "curl"), '#!/bin/sh\necho "curl $*" >> "$CALL_LOG"\nexit 9\n');
  await chmod(join(root, "install.sh"), 0o755);
  return { root, prefix, log, env: {
    ...process.env,
    HOME: home,
    PREFIX: prefix,
    TERMUX_VERSION: "0.118",
    PATH: `${fakeBin}:${process.env.PATH}`,
    SHELL: "/bin/bash",
    CALL_LOG: log,
  } };
}

const CARGO_FIXTURE = `#!/bin/sh
echo "cargo $*" >> "$CALL_LOG"
mkdir -p target/debug
printf '#!/bin/sh\nexit 0\n' > target/debug/vanta-kernel
chmod +x target/debug/vanta-kernel
`;

const NODE_FIXTURE = `#!/bin/sh
if [ "$1" = "-p" ]; then echo 22; exit 0; fi
printf '%s|%s|%s\n' "$VANTA_PLATFORM" "$NODE_OPTIONS" "$*"
`;
