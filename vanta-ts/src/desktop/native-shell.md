# Vanta Desktop native shell path

Current command:

```bash
npm run vanta -- desktop
```

This starts the local desktop surface at `http://127.0.0.1:7790`.

## What is live now

- session sidebar with search + open/new session
- central chat thread + composer
- model picker overlay backed by `PROVIDER_CATALOG`
- approval modal for kernel `ask` actions
- right rail: preview iframe, file/context list, gated terminal command runner
- command palette (`Cmd/Ctrl+K`)
- command center (`Cmd/Ctrl+.`): sessions/system/usage skeleton

## Native app next

Preferred shell: Tauri if we want small/mac-native; Electron if we want fastest feature parity (`webview`, `node-pty`, builder ecosystem).

Minimal native wrapper requirements:

1. launch `vanta desktop --no-open` or equivalent child process
2. open a native window to the local URL
3. forward close/restart events cleanly
4. expose file picker, directory picker, clipboard image paste, and PTY bridge
5. package/sign only after approval prompt flow is stable

Do not claim packaged desktop is shipped until a real native shell builds and opens the current local server.
