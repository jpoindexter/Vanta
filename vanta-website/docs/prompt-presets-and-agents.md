---
id: prompt-presets-and-agents
title: Prompt presets & custom agents
sidebar_position: 6
---

# Prompt presets & custom agents

Vanta can reuse one markdown definition in two ways:

- switch the current conversation's operating role with `/prompt`
- spawn a delegated worker with `agent_type`

The selected prompt is an overlay. Vanta's base safety instructions, approval flow,
tool policy, and Rust kernel remain active and cannot be replaced by a preset.

## Create a definition

Definitions load in this order: project `.vanta/agents/`, compatible project
`.claude/agents/`, then `~/.vanta/agents/`. Earlier definitions win on a name collision.

```md title="~/.vanta/agents/security-reviewer.md"
---
name: security-reviewer
description: Reviews changes for exploitable security defects.
tools: read_file, grep_files, shell_cmd
model: gpt-5.4
---
Act as a strict security reviewer. Inspect the actual change, run relevant checks,
rank findings by severity, and cite file locations. Do not edit files.
```

The `generate_agent` tool can also create a definition from a plain-English description.

## Switch the current session

```text
/prompt list
/prompt show security-reviewer
/prompt use security-reviewer
/prompt reset
```

Switching is session-only and replaces only the previous preset block. Goals, plan mode,
and other live system context remain intact. A definition's `tools` and `model` fields are
for spawned workers; `/prompt use` changes the current session's role and priorities.

## Spawn a prompted worker

The `delegate` tool accepts `agent_type`:

```json
{
  "goal": "Audit the authentication change",
  "instruction": "Inspect the diff, run focused tests, and report findings.",
  "agent_type": "security-reviewer"
}
```

For a worker, the definition's body is appended to a fresh Vanta base prompt, `tools`
can only narrow the tools already present, and `model` supplies a default. An explicit
`delegate.model` wins over the definition's model. Unknown types use the documented
`general-purpose` worker; empty or oversized prompt bodies are refused.

Built-in types are `explore`, `plan`, `verification`, and `general-purpose`.
