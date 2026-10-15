# CLAUDE.md — desktop Electron host

The host launches Vanta's local desktop server, owns the native window and dialogs, and exposes a minimal context-isolated preload bridge.

For attachment work, renderer `File` objects are converted with `webUtils.getPathForFile` in `preload.cjs`. The resulting strings cross IPC to `dropped-paths.mjs`, which expands directories deterministically, rejects symlinks and private/noise entries, and returns at most 50 files. Preserve top-level grouping in `items`: a folder item owns its filtered child-file list so the renderer can show one icon without discarding submission context. Keep project files relative and explicitly dropped external files absolute so the agent's existing readable-zone and kernel gates remain authoritative.

Run `npm run desktop:host:test` and `npm run desktop:context:smoke` from `vanta-ts/` after changes.
