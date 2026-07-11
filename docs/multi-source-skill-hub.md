# Multi-source skill hub

Vanta discovers public skills without treating discovery as trust or activation.
Every source-qualified install is normalized into a bounded local registry and
then passes through the same preview, hash, quarantine, approval, update,
rollback, doctor, and removal workflow as a configured static registry.

## Search and inspect

```bash
vanta skills search react --source skills-sh
vanta skills browse --source github
vanta skills search release --source official,tap
vanta skills search https://docs.example --source well-known
vanta skills inspect github:openai/skills/skills/.system/skill-creator
vanta skills inspect skills-sh:vercel-labs/agent-skills/vercel-react-best-practices
```

Supported source filters are `official`, `skills-sh`, `well-known`, `url`,
`github`, and `tap`. Results retain a source-qualified identifier, version when
declared, category when available, provenance URL, signature state, integrity
state, and cache status/expiry. Duplicate slugs must be selected with their
source-qualified identifier.

Signature and integrity labels are deliberately literal:

- `unsigned`: no signature file was advertised.
- `present-unverified`: signature material exists but Vanta did not
  cryptographically validate it.
- `source-declared`: a configured static registry supplied integrity hashes.
- `content-hashed`: Vanta downloaded and hashed the package; this proves local
  consistency, not publisher identity or safety.

## Install safely

```bash
vanta skills install github:openai/skills/skills/.system/skill-creator
vanta skills install github:openai/skills/skills/.system/skill-creator --yes
vanta skills approve skill-creator --yes
vanta skills doctor
```

The first command is preview-only. `--yes` writes a disabled package under
`~/.vanta/skill-registry-quarantine/`; it still cannot load until the separate
approval command. Package scripts are identified and stored mode `0600`, never
executed or made executable by discovery, install, or approval. Existing limits
remain in force: 64 companion files, 512 KiB per file, and 2 MiB per package.

The legacy `vanta skills hub <SKILL.md-url>` command is now a preview-only alias
for `vanta skills install url:<SKILL.md-url>`. It no longer writes directly into
active skills.

## Custom GitHub taps

```bash
vanta skills tap add myorg/skills-repo skills
vanta skills tap list
vanta skills search deploy --source tap
vanta skills tap remove myorg/skills-repo skills
```

Tap configuration is stored in `~/.vanta/skill-hub-taps.json`. Repository and
package paths are containment-checked. Built-in GitHub browsing covers curated
OpenAI, Anthropic, Hugging Face, and NVIDIA skill trees; configured taps remain
separate and removable.

## Cache and failures

Search records and normalized packages live under
`~/.vanta/skill-hub-cache/`. Search entries expire after one hour. A fresh
entry reports `cache=fresh@<expiry>`. If a source is offline after expiry, Vanta
may return its prior results as `stale-offline` and names the failed source.
One failed source does not hide successful results from other sources.

Public APIs can rate-limit unauthenticated browsing. A read-only failure does
not weaken install checks or fall through to a direct active write.
