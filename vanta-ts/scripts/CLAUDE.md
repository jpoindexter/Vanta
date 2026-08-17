# CLAUDE.md — verification scripts

These scripts are executable product proofs and smoke checks. Prefer real Electron/Ink/browser paths with isolated fixture data. Mock only the external boundary under test, state that boundary in output or acceptance docs, and always clean temporary projects and profiles.

Desktop attachment proof lives in `desktop-context-attachments-smoke.mjs`; it exercises the native picker, Finder-style file and folder drops, filtering, visible chips, and structured chat submission.

MSA service-contract proof lives in `msa-runtime-contract-smoke.mjs`; it drives authenticated loopback HTTP plus the real memory-provider resolver and local-source-of-truth path. The external model runtime is intentionally mocked and the receipt names that boundary.

TUI performance-entry proof lives in `tui-performance-entry-buffer.node-test.mjs`; it checks both shipped launchers select React's production reconciler before importing Ink and verifies a real high-update Ink render retains zero global performance measures.
