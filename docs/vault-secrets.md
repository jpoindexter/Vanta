# Vault-backed secrets

Vanta can map logical environment names to Bitwarden or 1Password references.
The manifest stores aliases, scopes, and rotation dates only. Secret values are
resolved into process memory at startup and are never written to the manifest,
receipts, or command output.

## Configure

Unlock one vault CLI first:

```bash
# Bitwarden
export BW_SESSION="$(bw unlock --raw)"

# or 1Password service-account / signed-in CLI
export OP_SERVICE_ACCOUNT_TOKEN="..."
```

Add only the aliases a profile or run needs:

```bash
vanta secrets vault add OPENAI_API_KEY \
  --backend bitwarden \
  --ref openai-production \
  --scope profile:research

vanta secrets vault add GEMINI_API_KEY \
  --backend 1password \
  --ref op://Engineering/Gemini/password \
  --scope profile:research,loop:daily-report
```

An active profile automatically uses scope `profile:<profile-id>`. A headless run
can set `VANTA_SECRET_SCOPE=loop:<id>`. Only exact or `*` grants are injected.

## Status and rotation

```bash
vanta secrets vault status
vanta secrets vault resolve OPENAI_API_KEY --scope profile:research
vanta secrets vault rotate OPENAI_API_KEY --to-ref openai-2026-07
vanta secrets vault rotate OPENAI_API_KEY --to-ref openai-2026-07 --yes
```

Status marks aliases stale after 90 days, expired by metadata, or overbroad when
granted to `*`. Resolve reports success with the value redacted.

Rotation is an explicit reference cutover: create/rotate the provider key in the
vault first, then point Vanta at the new item. Without `--yes`, Vanta prints only a
preview and exits. With confirmation, it resolves the new reference before
cutover and writes an audit receipt containing hashes of old/new references, not
the references or values.
