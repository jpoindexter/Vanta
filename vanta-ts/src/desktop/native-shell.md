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

Preferred shell for the first verified slice: Electron, because it gets the
current React/Vite desktop surface into a native dev window fastest while the
server and approval model stay unchanged.

## Dev native shell

```bash
npm run desktop:native
```

Smoke-check lifecycle without leaving a window open:

```bash
npm run desktop:native:smoke
```

The Electron main process launches `node --import tsx src/cli.ts desktop
<port> --no-open`, waits for the local server, opens a native `BrowserWindow`,
and terminates the child server on app quit. Use `--devtools` when debugging the
renderer.

Remaining native wrapper requirements:

1. expose file picker, directory picker, clipboard image paste, and PTY bridge
2. add restart UI once the app shell has a visible health/status control
3. package/sign only after approval prompt flow is stable

Do not claim packaged desktop is shipped until a real native shell builds and opens the current local server.
