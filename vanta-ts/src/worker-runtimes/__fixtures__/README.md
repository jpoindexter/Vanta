# Fixtures

- `*.jsonl` are SYNTHETIC outputs written from the documented stream formats of
  `claude -p --output-format stream-json --verbose` and `codex exec --json`.
  No real agent was run to produce them (both CLIs need a login). Field names
  follow the documented shapes; a CLI that changes its format will fail the
  parser tests only if the fixtures are refreshed from a real run.
- `version-*.txt` are RECORDED from the real CLIs on 2026-10-13 (`--version`).
