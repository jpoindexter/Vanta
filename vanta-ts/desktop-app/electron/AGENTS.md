# Electron Desktop Host Guidelines

- Keep Node and Electron APIs in this directory; expose only narrow, immutable methods through `preload.cjs`.
- Treat renderer input as untrusted. Validate IPC payloads and return serializable data.
- Resolve dropped paths in `dropped-paths.mjs`. Skip symlinks, credential-like files, and dependency or Vanta state directories; cap attachment expansion at 50 files. Return both the flat safe file list used for submission and top-level file/folder items used for compact renderer chips.
- Add `node:test` coverage for main-process helpers and include new host tests in `desktop:host:test`.
- Do not weaken BrowserWindow isolation (`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`).
