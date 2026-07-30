# Vanta Context Engineering Skills

A small, installable pack that applies modern context-engineering guidance
without adding another large always-loaded prompt.

## Architecture decision

Use a hybrid:

- Vanta owns a thin `/doctor` entry point, source inventory, safety policy, and
  reviewed-change boundary.
- The detailed audit, interface review, and context-splitting procedures remain
  on-demand skills.
- Cleanup is never automatic. The doctor is read-only until the operator reviews
  and approves an exact diff.

This keeps safety-critical behavior in the runtime while allowing the audit
playbook to evolve independently.

## Included skills

| Skill | Use |
| --- | --- |
| `context-doctor` | Inventory context, find conflicts/duplicates, and propose a safe cut list |
| `agent-interface-design` | Replace tool tutorials with precise schemas and structured failures |
| `progressive-disclosure` | Split large instruction files and skills into on-demand layers |

The context doctor includes a zero-dependency Node script:

```bash
node skills/context-doctor/scripts/audit-context.mjs /path/to/repository
node skills/context-doctor/scripts/audit-context.mjs /path/to/repository --json
```

It reads only recognized instruction files, skips dependencies and symlinks,
caps file count and size, and never writes to the target repository.

## Install

```bash
./scripts/install.sh
```

The installer copies all three skills to `~/.vanta/skills`, `~/.codex/skills`,
and `~/.claude/skills`. It adds `/context-doctor` to Claude Code without
replacing Claude’s built-in `/doctor`. Vanta can discover the skills from its
existing skill directory; the full runtime should map `/doctor` directly to
`context-doctor`.

Test into disposable directories:

```bash
CODEX_SKILLS_DIR=/tmp/codex-skills \
CLAUDE_SKILLS_DIR=/tmp/claude-skills \
CLAUDE_COMMANDS_DIR=/tmp/claude-commands \
VANTA_SKILLS_DIR=/tmp/vanta-skills \
./scripts/install.sh
```

## Development

```bash
npm test
npm run check
```

The tests prove inventory, layering, duplicate detection, and excluded-directory
behavior. They do not prove that the artifact-only Vanta snapshot has a working
slash-command registry; that integration requires the full checkout.

## Source boundary

The pack is an independent implementation informed by Thariq Shams’s public
context-engineering article and Anthropic’s public guidance on instruction
loading. It does not assume that removing a fixed percentage of context will
improve every model or repository.
