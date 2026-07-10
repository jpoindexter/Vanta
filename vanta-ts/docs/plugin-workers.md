# Plugin workers

Worker plugins run in a separate Node process under Node's permission model. The
worker can read its own plugin directory, but it receives no filesystem-write or
child-process permission. Access to Vanta-owned services is explicit and scoped.

## Manifest

```json
{
  "name": "operator",
  "version": "1.0.0",
  "worker": {
    "main": "worker.mjs",
    "capabilities": ["log.write", "schedule.jobs", "ui.panel"]
  }
}
```

Installing and enabling code does not grant host access. The operator grants
each requested capability separately:

```sh
vanta plugin install ./operator-plugin
vanta plugin enable operator
vanta plugin capabilities operator
vanta plugin grant operator log.write
vanta plugin grant operator schedule.jobs
vanta plugin grant operator ui.panel
```

Use `vanta plugin revoke operator <capability>` to remove a grant. Changes apply
on the next session start.

`examples/plugin-worker` is an installable reference. After enabling and granting
its three non-storage capabilities, run `vanta plugin check operator-worker 1200`
to launch it, inspect its panel, and observe a scheduled heartbeat job.

## Protocol v1

Messages are newline-delimited JSON over stdin/stdout. Vanta starts with:

```json
{"type":"init","protocol":1,"plugin":{"name":"operator","version":"1.0.0"},"granted":["log.write"]}
```

The worker requests a host service and waits for the matching response:

```json
{"type":"host.request","id":"1","capability":"log.write","method":"write","params":{"message":"ready"}}
{"type":"host.response","id":"1","ok":true,"value":{"written":true}}
```

After startup requests finish, the worker emits `{"type":"ready"}`. Unsupported,
undeclared, and ungranted requests receive `ok:false` with an error.

Available services:

| Capability | Method | Parameters |
| --- | --- | --- |
| `log.write` | `write` | `{ "message": string }` |
| `storage.read` | `get` | `{ "key": string }` |
| `storage.write` | `set` | `{ "key": string, "value": any }` |
| `schedule.jobs` | `register` | `{ "name": string, "intervalMs": number >= 1000 }` |
| `ui.panel` | `register` | `{ "panel": { "id": string, "title": string, "lines": string[] } }` |

Scheduled jobs arrive as `{"type":"job","name":"heartbeat","at":"..."}`.
Panels are data-only, control-stripped, and available from `/plugin-panels` in
the TUI. A worker cannot contribute executable UI code.
