# Automation blueprints

Automation blueprints package common scheduled and webhook workflows as
validated data. They ask for only the fields the workflow needs, show a preview,
and create state only after explicit confirmation.

## Discover and preview

```bash
vanta automation blueprints
vanta automation preview daily-brief topic=roadmap
vanta automation preview github-pr-review id=review-pr deliver=local
```

In the interactive TUI, `/blueprint` lists the same catalog. Use
`/blueprint <name> key=value`; Vanta reports missing fields and prints the exact
continuation command. A complete form displays the schedule or webhook target
without creating it.

## Confirm and control

```bash
vanta automation apply daily-brief topic=roadmap --yes
vanta automation list
vanta automation pause <automation-id>
vanta automation resume <automation-id>
vanta automation test <automation-id>
vanta automation receipts <automation-id>
```

Schedule blueprints create an active cron entry. Webhook blueprints create a
disabled signed route so it can be tested before `resume` enables it. Operator
Home reports active and paused automation counts and links to these controls.

## Add a blueprint

Bundled definitions live in `vanta-ts/automation-blueprints/`. Add or override a
personal definition at
`~/.vanta/automation-blueprints/<name>/blueprint.json`; no `src` edit is needed.
Definitions use `{{field}}` placeholders and one of these targets:

```json
{
  "name": "weekly-review",
  "description": "Review the project every Monday.",
  "kind": "schedule",
  "fields": [{ "key": "repo", "label": "Repository" }],
  "schedule": {
    "cron": "0 9 * * 1",
    "instruction": "Review {{repo}} and report verified next actions."
  }
}
```

Invalid definitions are skipped. Cron expressions and webhook delivery targets
are validated during preview, before any cron, route, secret, or receipt exists.
