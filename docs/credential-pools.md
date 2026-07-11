# Credential pools

Credential pools rotate API-key references for one provider before Vanta falls
back to a different provider. Pool files contain only source references and
redacted audit hashes; resolved values remain in process memory.

## Configure

```bash
vanta auth pool add openai primary --source env --ref OPENAI_API_KEY
vanta auth pool add openai secondary --source keychain --ref vanta-openai-2
vanta auth pool add anthropic reserve --source vault --ref ANTHROPIC_RESERVE
vanta auth pool list
vanta auth pool test openai secondary
```

Supported sources are `env`, `keychain`, `bitwarden`, `1password`, and `vault`.
The `--ref` argument is an environment variable, secret-manager reference, or
existing Vanta vault alias. Literal credential values are not accepted.

## Runtime behavior

Each request leases one ready credential for two minutes. Concurrent agents and
profiles cannot lease the same credential. A successful request releases the
lease. Vanta handles failures as follows:

- `429` marks the reference on a one-minute cooldown and tries the next key.
- `401` and `402` mark the reference exhausted and try the next key.
- Non-credential failures do not consume or rotate the key.
- After pool credentials and the base key are exhausted, the existing
  `VANTA_FALLBACK_PROVIDERS` chain can select another provider.

Streaming rotates only before the first output chunk. A mid-stream failure is
never replayed because doing so could duplicate visible text or tool calls.

## Manage

```bash
vanta auth pool list
vanta auth pool test <provider> <id>
vanta auth pool remove <provider> <id>
```

`test` verifies that the reference resolves and redacts its value. Pool rotation
keeps the same provider and model, preserving provider-level prompt-cache
behavior where available; account-scoped caches and spend limits may differ.
