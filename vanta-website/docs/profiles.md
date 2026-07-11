---
id: profiles
title: Specialist profiles
---

# Specialist profiles

Profiles are persistent, named specialists. Unlike a temporary delegated worker, a profile
keeps its own model/settings, skills, memory, gateway identity/state, inbox, and work history
across Vanta restarts.

## Create and target a profile

```bash
vanta profiles create "Research Lead" --provider codex --model gpt-5.5 --tools read_file,web_search,ref_search
vanta profiles target research-lead "Audit provider fallback"
vanta profiles inbox research-lead
```

`target` (or its `send` alias) writes a durable queued message. It does not bypass the
kernel or silently execute work; the existing task and agent runners remain responsible for
execution and approval.

## Tool boundaries

`--tools` declares the role's allowed tool surface. It is enforced by the live registry,
including tools registered later by MCP servers or plugins. Change it explicitly:

```bash
vanta profiles tools research-lead --allow read_file,grep_files,web_search,ref_search
vanta tools why gmail_send
```

`tools why` reports whether the active profile can see the tool, its typical kernel risk,
setup prerequisites, missing credentials, and exact repair commands. The kernel still
assesses real arguments per call; the typical label is explanatory, not a replacement
decision. Profiles without `allowedTools` remain backward-compatible but emit a full-surface
warning. Failed tool calls append the same repair guidance after retries.

## Switch profiles

```bash
vanta profiles switch research-lead
vanta profiles list
vanta home
```

The switch takes effect on the next Vanta start. Startup redirects `VANTA_HOME` to the
selected profile home, so settings, skills, memory, gateway state, and work records stay
separate. `vanta home` shows the active profile, queued count, and latest targeted work.

## Clone or archive

```bash
vanta profiles clone research-lead "Research Backup"
vanta profiles archive research-lead
```

Clone copies provider/model configuration and creates a fresh gateway identity. It does not
copy private memory, inbox messages, work history, sessions, or credentials. Archive keeps
the profile files and history but prevents switching or targeting it; archiving the active
profile also clears the active marker.

Profile data lives below `~/.vanta/profiles/<id>/` by default. Set `VANTA_HOME` before the
first profile command to use a different base store.

## Install a profile distribution

A distribution packages capability and defaults without packaging private state. Preview is
the default; `--apply` is required to write:

```bash
vanta profile install ./research-profile
vanta profile install https://github.com/example/research-profile.git --apply
vanta profile update research-lead
vanta profile update research-lead --apply
```

The source root contains `vanta-profile.json`:

```json
{
  "version": 1,
  "name": "Research Lead",
  "profile": {
    "provider": "codex",
    "model": "gpt-5.5",
    "gatewayIdentity": "research-bot",
    "allowedTools": ["read_file", "web_search", "ref_search"]
  },
  "soul": "SOUL.md",
  "settings": "settings.json",
  "skills": ["skills/research"],
  "cron": "cron.json",
  "mcp": "mcp.json"
}
```

Vanta records the source commit and hashes of every owned destination file. Update previews
the changed files, backs up the previous owned copies, and then applies only those paths.
Current operator settings win over new distribution defaults.

The source is rejected if its tree contains `.env` files, keys, credentials, tokens,
memory, sessions, inboxes, work logs, or history. Those private files are never valid
distribution content, even when the manifest does not reference them. Secret-shaped keys
inside declared JSON, symlinks that resolve outside the source, and installed destination
paths that escape the profile home are also rejected. When an update removes a previously
owned file, Vanta backs it up before deleting the stale profile copy.
