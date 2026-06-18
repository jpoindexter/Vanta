# AGENTS.md — vanta-ts/src/cli-dx

CLI developer-experience helpers for config, backup/import, completions, and prompt-size diagnostics.

- `config.ts` owns `vanta config` file operations over `.env`; writes emit `ConfigChange` shell-hook events after the file is updated.
- Keep secret values redacted in output and tests.
- This folder is CLI plumbing only; runtime settings loading lives in `../settings/`.
