# Global Codex — playbook, toolbox, proof

Owner requested applying the supplied delegation transcript globally in Codex.
This reuses Vanta's existing own-a-job concept, adapted to Codex's skill format.
The supplied transcript is reference material, not authorization for jobs or
account actions. YouTube fetch was throttled; its Anthropic claims were not
independently verified and are not adopted as policy.

## Installed and checked

- User skill: /Users/jasonpoindexter/.agents/skills/own-a-job/SKILL.md.
- One bounded routing section in /Users/jasonpoindexter/.codex/AGENTS.md.
- Original instructions backed up before editing:
  /Users/jasonpoindexter/.codex/backups/delegation-2026-10-23/AGENTS.before-1792777246251.md.
  Original SHA-256: 9111ba9ab72c065655ec411947e5610d36574d624d8c7303b7f00aa7d0b227ae.
- Exact comparison passed: removing the one new section yields the original
  global AGENTS byte-for-byte.
- Native Codex 0.163.0 app-server skills/list (forceReload, /private/tmp cwd)
  returned own-a-job, scope user, enabled true, at the exact path above.
  No inference turn or additional service was started.
- Frontmatter/name/description/placeholder validation passed with existing
  js-yaml and Node assertions. The supplied Python quick_validate.py could not
  run: PyYAML is absent in both system and bundled Python. No package installed
  and no claim that the Python validator passed.

This follows official user-scope skill discovery and global-instruction behavior:
[Skills](https://learn.chatgpt.com/docs/build-skills) and
[AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md).
Use a new Codex turn/session to load the global instructions; if the new skill
does not appear in the current app picker, restart Codex. Discovery was actually
checked via the CLI, not inferred from a folder existing.

## Use it

```text
$own-a-job Take over this recurring job: [name the job].
Check existing playbooks and approved assets first. Ask only for missing
inputs, decisions, authority and output requirements, one question at a time.
Show me the playbook before adopting it. Include its Toolbox and executable
Proof of Done. Do not send, publish, schedule or buy anything without authority.
```

Each named job keeps its own procedure and approved-asset index. Reuse checked
assets before generating replacements. Index an asset's real relative path,
purpose, version/date and owner approval reference only after approval.
Tests passing and model self-review do not make an asset owner-approved.
No empty global asset warehouse, invented approved assets, duplicate job
framework or private-file copying was needed.

On failure, propose a narrow repair to that job's procedure/checks, not a global
rule rewrite. Two unsuccessful repairs stop for review. Missing authority,
unknown external effects and unavailable proof remain explicit limits.

## Not yet proven

No particular recurring job has been named or approved for adoption. A real
two-run trial remains open: the second must reuse an approved asset, and both
must pass the job's actual checks. Discovery validates setup, not business
execution or reliability. Existing Vanta trial/owner gate remains unchanged.
No config.toml, model, account, credential, permission or billing setting changed.
