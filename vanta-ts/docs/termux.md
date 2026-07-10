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

The installer detects Termux and uses Android-native packages: `nodejs-lts`,
`rust`, `python`, `make`, `clang`, `pkg-config`, and `esbuild`. It builds the
zero-dependency Rust safety kernel locally because GNU/Linux release binaries
target glibc while Termux uses Android/Bionic. Runtime dependencies install
without desktop lifecycle scripts or optional native accelerators; Vanta uses
Termux's native esbuild and its bundled WASM Bash grammar. The launcher is
installed into `$PREFIX/bin`, which Termux already places on `PATH`.

Termux defaults Vanta's Node heap ceiling to 1536 MB instead of the desktop 8192
MB ceiling. Override it with `VANTA_NODE_MAX_MB` when the device has more or less
memory.

Desktop, iOS, microphone, and Playwright browser features are not part of the
Termux runtime profile. The CLI, TUI, gateway, scheduler, agents, tools, memory,
and kernel safety path use the same code as macOS/Linux. The automated Android
x86_64 emulator gate passes the sequence below. A release claim still requires
the same proof on a physical ARM64 Android device:

```sh
vanta --help
vanta doctor
vanta run "Reply with TERMUX_OK and do not use tools"
vanta gateway verify-channels
```
