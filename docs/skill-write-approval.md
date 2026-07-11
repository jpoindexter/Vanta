# Skill-write approval

Vanta can require explicit review before any agent-authored skill mutation
becomes active. Operator-invoked installs and system-managed bundled skills keep
their existing explicit flows; `write_skill`, `skill_manage`, and background
self-improvement use this queue.

## Enable and review

```bash
vanta skills approval on
vanta skills pending
vanta skills diff <proposal-id>
vanta skills approve <proposal-id>
vanta skills reject <proposal-id> "reason"
vanta skills approval off
```

The setting is stored as `skills.writeApproval` in
`~/.vanta/settings.json`. With approval off, agent mutations retain their
existing immediate behavior but still pass path, size, capability-name, and
injection checks. With approval on, the active skill tree does not change until
approval.

The TUI and messaging slash surface supports the same review commands:

```text
/skills pending
/skills diff <proposal-id>
/skills approve <proposal-id>
/skills reject <proposal-id> reason
/skills approval on|off
```

Slash diffs are truncated for message safety and name the full local proposal
file. CLI diffs are complete.

## Mutation coverage

The `skill_manage` tool supports:

- `create`: create a new skill; refuses to replace an existing name.
- `edit`: replace an existing skill definition.
- `patch`: replace one exact body fragment.
- `write_file`: add or update a contained companion file.
- `remove_file`: move a companion file into reversible removed storage.
- `delete`: archive the complete skill under `skills/_archive/`.

The older `write_skill` tool automatically selects `create` or `edit` and uses
the same queue. Background learning also stages through this path and cannot
activate a learned skill while approval is enabled.

## Conflict and safety behavior

Each proposal records the hash of the target at proposal time. Approval refuses
if the operator or another process changed that target; recreate or reject the
stale proposal instead of overwriting the newer work.

Approval reruns containment, injection, and requested-capability syntax checks.
The content scanner remains independent of the human approval decision: an
approval cannot turn a scanner failure into an active mutation. Companion paths
cannot escape the skill directory or replace `SKILL.md` directly.

Pending proposals survive restarts under `~/.vanta/pending/skills/`. Resolved
proposal records move to `~/.vanta/pending/skills/_resolved/`. Reversibly removed
companion files live under `~/.vanta/skill-write-removed/`. Redacted decisions
append to `~/.vanta/skill-write-audit.jsonl`; receipts contain action, skill,
source session, reason, decision, timestamps, and hashes, but not skill content.
