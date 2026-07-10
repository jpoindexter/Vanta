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
`rust`, `python`, `make`, `clang`, and `pkg-config`. It builds the zero-dependency
Rust safety kernel locally because GNU/Linux release binaries target glibc while
Termux uses Android/Bionic. Native Node modules build from source. The launcher
is installed into `$PREFIX/bin`, which Termux already places on `PATH`.

Termux defaults Vanta's Node heap ceiling to 1536 MB instead of the desktop 8192
MB ceiling. Override it with `VANTA_NODE_MAX_MB` when the device has more or less
memory.

Desktop, iOS, microphone, and Playwright browser features are not part of the
Termux runtime profile. The CLI, TUI, gateway, scheduler, agents, tools, memory,
and kernel safety path use the same code as macOS/Linux. A release claim still
requires the on-device smoke sequence below:

```sh
vanta --help
vanta doctor
vanta run "Reply with TERMUX_OK and do not use tools"
vanta gateway verify-channels
```
