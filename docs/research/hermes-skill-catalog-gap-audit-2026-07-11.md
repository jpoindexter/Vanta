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
| Image/video/audio/3D production recipes and generators | Vanta analyzes images/video; it has no native video-generation tool or verified studio workflow | `HERMES-MEDIA-STUDIO-SKILL-PACK` |
| Stripe Link, MPP, and Stripe Projects | Generic browser/MCP can attempt these, but no payment-specific secret, approval, amount, or receipt contract exists | `HERMES-PAYMENT-SKILL-PACK` |
| Shopping, Shopify, and agent telephony | SMS transport exists; storefront administration, checkout/returns, and voice-call workflows do not | `HERMES-COMMERCE-TELEPHONY-SKILL-PACK` |
| Excel authoring plus DCF/LBO/merger/comps packs | Existing spreadsheet card covered generic workbook control only | Expanded `HERMES-SPREADSHEET-COPILOT` |

## Priority

1. Prove the media studio workflow. It is high-value and can use reversible
   file outputs rather than financial or external side effects.
2. Add payments only behind a transaction-specific contract. A model budget is
   not a purchase authorization.
3. Add commerce/telephony and finance packs after their underlying operator
   surfaces have real acceptance receipts.

The goal is not to copy 174 prompts into Vanta. The goal is to make portable
outcome packs installable and then ship a small set of workflows with executed
end-to-end proof under Vanta's kernel.
