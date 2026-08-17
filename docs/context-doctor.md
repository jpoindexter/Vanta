# Context Doctor

Vanta’s doctor combines ordinary runtime health with a read-only audit of the
instruction layers that shape every agent turn.

```bash
vanta doctor
vanta doctor --limit 12
```

The context section reuses `vanta harness-thickness --no-record`: it inventories
the canonical always-loaded sources, estimates their token weight, detects exact
duplicate hard rules, and surfaces explicit scaffold or long-rule candidates. It
does not write audit history, modify instructions, or change permissions.

For semantic review, run:

```bash
vanta skill context-doctor
```

That on-demand skill reads the applicable layers together and classifies
conflicts, duplicates, generic guidance, obsolete model compensation,
repository-specific gotchas, situational procedures, and controls better encoded
as code or tests. It stops at a proposed diff.

Three bundled skills auto-install into `~/.vanta/skills` on the next Vanta
session:

- `context-doctor`
- `agent-interface-design`
- `progressive-disclosure`

## Safety boundary

- No fixed reduction target; the often-cited 80% result is not a product goal.
- Approval, destructive-action, scope, secrets, and compliance rules remain
  always loaded unless an equivalent deterministic control is verified.
- Cleanup and permission changes are separate operator decisions.
- `vanta harness-thickness remove` requires an exact file, line, and expected
  text so stale output cannot delete the wrong instruction.
