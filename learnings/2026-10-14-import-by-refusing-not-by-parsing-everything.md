# When importing another tool's config, refuse what you cannot read exactly and report it

Date: 2026-10-14 · Area: migrate / config import

The importer already accepted MCP servers and a model from JSON, so "imports skills only" in the parity note was about the
real file format: a Hermes home keeps both in `config.yaml`, which was never opened. The fix was a reader, not a new importer.

## Pattern

1. Read the existing importer before scoping: the apply, trust and secret handling were already there. The change is one
   planner step that feeds the same plan type, so preview, picker, backup and apply needed no edits.
2. For a foreign format with no parser dependency, read only the sections you map and throw with the line number on
   anything else (anchors, block scalars, tabs, nested flow). A skipped server in the report beats a server half-imported
   with a wrong `args`.
3. Make the report the contract: every key that is not mapped becomes a gap row (`file: path.to.key  reason`). A test asserts
   the row for each unmapped fixture key, so adding a new mapped key forces a decision about the others.
4. Secrets by shape AND by slot: a name check (`*_TOKEN`) misses `NOTE: ghp_...`, a value check misses `PASSWORD: hunter2`.
   Use both, and keep the value out of the plan itself, not just out of the preview. Map to a `${NAME}` reference the
   runtime resolves instead of deleting the entry, so the server still starts once the operator exports the variable.
5. Check what the runtime resolves before inventing a mapping: Vanta expands `${NAME}` in whole env values and in headers
   (`resolveTemplate`), not in args or urls. That decided which references are kept and which servers are skipped.
6. Prove "does not pre-trust" on the launch path, not by reading the writer: mount the imported file headless and with a
   declining confirmer, and include a deny-listed package so the guard's refusal (before any prompt) is observed.
7. A fixture secret must not look like a real one (gitleaks scans commits); build credential-shaped strings at runtime in
   tests and in the sandbox script.
