# Termux / Android

Vanta runs from a local checkout inside Termux. Install Termux from F-Droid, then:

```sh
pkg update
pkg install git
git clone https://github.com/jpoindexter/Vanta.git
cd Vanta
./install.sh
vanta setup
vanta
```

The installer detects Termux and uses Android-native `curl`, `nodejs-lts`,
`python`, and `esbuild` packages. On ARM64 it first downloads the checksum-verified
`aarch64-linux-android` safety kernel built against Android/Bionic. If that
release artifact is unavailable, it installs `rust`, `make`, `clang`, and
`pkg-config` and builds the zero-dependency kernel on-device. Runtime
dependencies install without desktop lifecycle scripts or optional native
accelerators; Vanta uses Termux's native esbuild and its bundled WASM Bash
grammar. The launcher is installed into `$PREFIX/bin`, which Termux already
places on `PATH`.

Termux defaults Vanta's Node heap ceiling to 1536 MB instead of the desktop 8192
MB ceiling. Override it with `VANTA_NODE_MAX_MB` when the device has more or less
memory.

Desktop, iOS, microphone, and Playwright browser features are not part of the
Termux runtime profile. The CLI, TUI, gateway, scheduler, agents, tools, memory,
and kernel safety path use the same code as macOS/Linux. The automated Android
x86_64 emulator gate passes the sequence below. A release claim still requires
the same proof on a physical ARM64 Android device. From the checkout on that
device, run the executable proof:

```sh
./scripts/termux-arm64-device-proof.sh
```

The script refuses non-Termux and non-ARM64 hosts, starts a local mock
OpenAI-compatible provider, starts the real safety kernel, runs the checks
below, and prints `TERMUX_ARM64_E2E_OK` only after they pass:

```sh
vanta --help
vanta doctor
vanta run "Reply with TERMUX_OK and do not use tools"
vanta gateway verify-channels
```

It also writes the final marker to `.vanta/termux-arm64-proof.txt`, which
`vanta run-anywhere status` reads for the aggregate release gate. The final
release proof requires the marker to include `release_kernel=1`, produced by the
`--require-release-kernel` mode below.

After a release is tagged with the Android/Bionic kernel asset, prove that the
device installs the release artifact instead of falling back to an on-device Rust
build:

```sh
./scripts/termux-arm64-device-proof.sh --require-release-kernel
```
