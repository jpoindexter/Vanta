# Reusable Run Library

Vanta’s desktop app records each user turn as a local, versioned run bundle. Open **Saved runs** beside **Threads** to search past work, inspect its provenance, and save useful runs for later.

Each captured run includes:

- the prompt, provider, model, status, and final output;
- explicitly attached project files with hashes and bounded local snapshots;
- a redacted tool and approval timeline;
- source-session, turn, and fork/replay lineage.

Legacy sessions appear under **All runs** with an **Incomplete provenance** label. Vanta does not invent missing approval decisions, file hashes, or timestamps.

## Fork and Replay

**Fork** creates a fresh task containing an editable copy of the prompt and replaceable file attachments. Prior assistant responses, tool results, and approvals are not added to the new context.

**Review replay** compares current files, project root, provider, model, and available tools with the recorded run. **Replay now** creates a fresh task and submits a normal new turn through the current kernel; it never executes recorded tool calls. Any action that currently needs approval asks again, even when a stored rule or Full access would normally clear the prompt.

Changed, missing, or redacted inputs are called out before replay. The operator must acknowledge the drift and can replace the files before pressing Send.

## Storage and Privacy

Run records live under `~/.vanta/runs/` with owner-only permissions. Snapshots are limited to 10 MB per file and 50 MB per run. Private filenames, out-of-project paths, and files containing recognized credential patterns are never snapshotted. Free-text record fields and tool payloads are redacted before persistence.

Unsaved runs follow their source session’s cleanup lifecycle. Saved runs remain until explicitly unsaved or deleted from the library.
