---
id: settings
title: Settings & secrets
sidebar_position: 5
---

# Settings & secrets

Beyond `.env` ([Configuration](./configuration.md)), Vanta has a layered settings file, a secret-injection helper, and an opt-in execution sandbox.

## Layered settings

Settings merge across three scopes — **local wins**:

```
~/.vanta/settings.json          (user)
.vanta/settings.json            (project)
.vanta/settings.local.json      (local, gitignored)
```

The zod-validated schema covers: `allowedTools` / `blockedTools`, `env` overrides, executive-function gate toggles, `effortLevel`, `autoMode.rules`, UI prefs, the plugin `enabled` list, and `api_key_helper`.

Precedence for an `ask` action: **kernel block → permission rules → auto-mode → operator profile** (the profile can only tighten). See [Permissions & hooks](./permissions-and-hooks.md).

## Secret injection (api_key_helper)

Instead of putting keys in `.env`, fetch them at startup from a secret manager:

```json
// .vanta/settings.json
{ "api_key_helper": "op read op://vault/anthropic/key" }
```

The helper command runs at startup, its output is used as the provider key, cached ~5 minutes, and **never throws** (failures log to stderr). Provider→env-var mapping is built in (e.g. `anthropic` → `ANTHROPIC_API_KEY`). Works with 1Password, Vault, or any command that prints a secret.

## Execution sandbox

Wrap `shell_cmd` and `run_code` in OS-level isolation:

```bash
VANTA_SANDBOX=1        # macOS sandbox-exec / Linux bwrap; default OFF
VANTA_SANDBOX_NET=1    # allow outbound network inside the sandbox
```

When on, execution is restricted to the project root, writable zones, and the OS temp dir (network optionally blocked). Default off = byte-identical pass-through. If a backend is required but missing, it refuses rather than silently running unsandboxed.

## Path-scoped rules

`~/.vanta/rules/*.md` inject prompt constraints, optionally scoped to file globs via frontmatter `paths:` — see [Modularity & architecture](./modularity.md#path-scoped-rules).
