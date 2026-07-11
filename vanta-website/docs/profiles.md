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
vanta profiles create "Research Lead" --provider codex --model gpt-5.5
vanta profiles target research-lead "Audit provider fallback"
vanta profiles inbox research-lead
```

`target` (or its `send` alias) writes a durable queued message. It does not bypass the
kernel or silently execute work; the existing task and agent runners remain responsible for
execution and approval.

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
