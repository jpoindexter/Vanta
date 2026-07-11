# Hermes Skill Catalog Gap Audit - 2026-07-11

## Sources

- [Hermes bundled skills catalog](https://hermes-agent.nousresearch.com/docs/reference/skills-catalog/)
- [Hermes optional skills catalog](https://hermes-agent.nousresearch.com/docs/reference/optional-skills-catalog)
- [Hermes skills system](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills)
- Local reference checkout: `NousResearch/hermes-agent@3b2ef789dfcf92f5b7b18c08c59d25948e50857f`

The local reference contains 174 bundled and optional `SKILL.md` packages. The
official Skills Hub also aggregates external registries; its live page reports
that it is loading more than 88,000 skills. Those are ecosystem counts, not
verified Vanta capabilities.

## What Vanta Already Has

- Local skill loading, bundled installation, progressive skill lookup, and
  agent-generated skills.
- Skill bundles under `~/.vanta/skill-bundles/`.
- Kernel-gated shell, browser, MCP, messaging, scheduling, profiles, Kanban,
  delegation, image understanding, and video analysis.
- A static registry client with full preview, SHA-256 verification, disabled
  quarantine, explicit approval, update conflict preservation, reversible
  removal, and audit records (`PUBLIC-SKILL-REGISTRY-CLIENT`).
- Vault-backed secret references and per-session model-spend limits.

## Material Gaps

| Hermes surface | Vanta evidence | Roadmap action |
| --- | --- | --- |
| Skill packages with `references/`, `templates/`, and `scripts/` | Shipped bounded full-package preview, quarantine, update, rollback, and removal | `HERMES-PORTABLE-SKILL-PACKAGES` shipped |
| Official, skills.sh, well-known, GitHub, and custom-tap discovery | Shipped normalized source filters, cache/offline state, provenance, aliases, taps, and quarantine routing | `HERMES-MULTISOURCE-SKILL-HUB` shipped |
| Staged approval for agent-authored skill create/edit/delete | Shipped durable create/edit/patch/supporting-file/delete queue with CLI/TUI review, stale guards, and receipts | `HERMES-SKILL-WRITE-APPROVAL-QUEUE` shipped |
| Image/video/audio/3D production recipes and generators | Verified media studio renders scoped local MP4 briefs through staged providers; broader provider coverage remains additive | `HERMES-MEDIA-STUDIO-SKILL-PACK` shipped |
| Stripe Link, MPP, and Stripe Projects | Test-only exact-total contract, fresh approval, cap/replay ledger, redacted adapters, HTTP 402 validation, and vault-only Keychain provisioning are implemented; live Link/MPP receipts remain | `HERMES-PAYMENT-SKILL-PACK` blocked on live acceptance |
| Shopping, Shopify, and agent telephony | Scoped Shopify operations and consented Twilio lifecycle are implemented; each awaits its live provider receipt | Child cards blocked on live acceptance under `HERMES-COMMERCE-TELEPHONY-SKILL-PACK` |
| Excel authoring plus DCF/LBO/merger/comps packs | Local chart snapshots, formula explanation, and verified five-pack finance model generation are implemented; Excel/Sheets sidecar acceptance remains | `HERMES-SPREADSHEET-COPILOT` blocked on host acceptance |

## Priority

1. Prove the shipped payment boundary against live sandbox/test-mode Stripe and
   MPP endpoints; keep real money unreachable until those receipts exist.
2. Run the scoped Shopify and consented Twilio workflows against development
   accounts and retain their redacted live receipts.
3. Finish spreadsheet host acceptance and finance-pack depth after the live
   commerce receipts, without reopening the shipped local workflow contracts.

The goal is not to copy 174 prompts into Vanta. The goal is to make portable
outcome packs installable and then ship a small set of workflows with executed
end-to-end proof under Vanta's kernel.
