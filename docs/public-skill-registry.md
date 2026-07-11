# Public skill registry

Vanta can browse a static skill registry without trusting or activating its
contents. Set `VANTA_SKILL_REGISTRY` to a local `index.json` file or an HTTP(S)
URL:

```bash
export VANTA_SKILL_REGISTRY=/path/to/registry/index.json
vanta skills browse
vanta skills search "release notes"
vanta skills view release-notes
```

`view` prints the complete `SKILL.md`, source, version, requested capabilities,
platforms, dependencies, every package file, detected executable/setup risks,
and SHA-256 integrity result. A mismatched hash or declared byte count blocks
installation.

## Install and approve

Installation is a two-step trust decision:

```bash
vanta skills install release-notes
vanta skills install release-notes --yes
vanta skills approve release-notes --yes
```

The first command is preview-only. The confirmed install writes the skill to
`~/.vanta/skill-registry-quarantine/` with mode `0600`; it remains disabled.
Approval moves it into `~/.vanta/skills/`. Vanta refuses to replace an existing
local skill with the same slug.

## Update, diagnose, and remove

```bash
vanta skills update release-notes
vanta skills update release-notes --yes
vanta skills rollback release-notes 1.0.0 --yes
vanta skills doctor
vanta skills remove release-notes --yes
```

An update prints its diff before applying. Vanta backs up an unmodified prior
version. If the active file has local edits, Vanta preserves it and places the
incoming version under `~/.vanta/skill-registry-updates/` for manual review.
Confirmed rollback restores a recorded prior package and keeps the displaced
version available as another backup.
Removal is reversible: the files move to
`~/.vanta/skill-registry-removed/` instead of being deleted.

Registry lifecycle events are recorded in
`~/.vanta/skill-registry-audit.jsonl`. `doctor` reports each managed skill as
`ok`, `modified`, `missing`, or `removed`.

## Registry format

The index is deliberately static and credential-free:

```json
{
  "version": 1,
  "skills": [{
    "slug": "release-notes",
    "name": "Release notes",
    "version": "1.0.0",
    "description": "Draft release notes from verified changes.",
    "source": "release-notes/SKILL.md",
    "sha256": "<64 lowercase hex characters>",
    "capabilities": ["read files"],
    "platforms": ["linux", "macos"],
    "dependencies": ["node>=20"],
    "files": [{
      "path": "references/api.md",
      "source": "release-notes/references/api.md",
      "sha256": "<64 lowercase hex characters>",
      "bytes": 1200,
      "executable": false
    }]
  }]
}
```

Relative local sources must remain inside the registry directory. HTTP sources
resolve relative to the index URL. Hosting, publication, and community
moderation are separate from this client-side trust workflow.

Packages may contain up to 64 companion files. Each companion is limited to
512 KiB and the complete package to 2 MiB. Paths are relative, unique, and may
not traverse outside the package. Vanta writes every quarantined file with mode
`0600`; a declared script is identified and scanned but never executed or made
executable by install, approval, update, or rollback. Actual runtime execution
still passes through the normal kernel boundary.
