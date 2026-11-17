# Existing settings target guard — 2026-10-25

Source follow-on, not newly installed acceptance. The shared writeSettings
function now validates an existing target before creating directories or
replacing bytes. Only ENOENT means a missing optional target. It preserves
the existing complete-replacement API; it does not infer other settings scopes.

The plugin CLI had one earlier effect: uninstall removed the directory before
persisting its disabled entry. It now validates layered policy before that
removal. Existing uninstall, scope and enable-list behavior are unchanged.

## Executed proof

- Baseline9failed/3passed. Shared guard alone left three plugin failures;
  explicit uninstall preflight resolves the earlier deletion ordering.
- Parent104focused tests/ninefiles and runtime typecheck pass: eight new writer
  cases, four uninstall cases and existing access-mode/config/setup/plugin
  management/output-style/store consumers. No full suite run.
- Independent public writeSettings/saveDesktopAccessMode/runPlugin source proof
  retains corrupt/nonobject/schema-invalid bytes, accepts missing/valid writes,
  keeps a synthetic plugin directory on invalid policy, and uninstalls/disables
  normally with valid policy. Network/subprocess counters are zero.
  Receipt: proofs/target-writer-guard-2026-10-25/direct.json.

## Limits and next action

This protects the TARGET, not every other settings scope before every writer.
Multi-file snapshots, atomicity, concurrency/CAS and symlink handling remain
unproven. Config/sandbox callbacks currently need visible error recovery for
late persistence failure; do not ship a silent catch or claim full writer UX
from this guard. No owner configuration or plugin was touched. Broad cards,
security and owner acceptance gates remain open.

Follow-on source validation: the public writer also rejected neither invalid
incoming policy nor a new invalid scope. Two regressions reproduce that failure;
the existing schema now validates recognized incoming values before mkdir/write,
without stripping unknown keys from the provided object. All10writer cases and
42focused consumer cases/sixfiles pass; runtime tsc passes. No whole-layer or
atomicity claim follows from this additional input-boundary check.
