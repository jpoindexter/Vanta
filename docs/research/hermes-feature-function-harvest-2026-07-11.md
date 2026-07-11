# Hermes Feature / Function Harvest - 2026-07-11

Status refreshed 2026-07-12. For the newer repository delta, see
`hermes-current-delta-2026-07-12.md`.

Source checked:
- `reference/hermes-agent` at `3b2ef789d`
- `reference/hermes-agent/website/docs/user-guide/profile-distributions.md`
- `reference/hermes-agent/website/docs/guides/automation-blueprints.md`
- `reference/hermes-agent/website/docs/user-guide/features/context-references.md`
- `reference/hermes-agent/website/docs/user-guide/features/credential-pools.md`
- `reference/hermes-agent/website/docs/developer-guide/plugin-llm-access.md`
- `reference/hermes-agent/website/docs/user-guide/features/deliverable-mode.md`

## Keep

These are useful Hermes functions that map cleanly to Vanta's vision:

- Profile distributions: install a whole specialist profile from a repo while preserving local secrets, memories, sessions, and operator overrides.
- Automation blueprint catalog: reusable scheduled/webhook workflows that gather a few fields, preview the job, and then arm it.
- Context references v2: typed references for file ranges, folders, git state, and URLs with visible expansion and safety limits.
- Credential pools: same-provider key rotation and cooldown before falling through to provider fallback.
- Plugin LLM lane: bounded plugin access to host-owned model calls without exposing credentials.
- Deliverable auto-attach: generated files become native chat artifacts, with receipts and path redaction.

## Already Covered

These Hermes features are already substantially represented in Vanta and did not need new cards:

- General reusable blueprints: `VANTA-BLUEPRINTS` is shipped, though automation-specific catalog UX still needs its own card.
- Basic `@` context: `U2` is shipped, though typed git/url/range expansion needs v2.
- Provider fallback: `MODEL-FALLBACK` is shipped; credential pools are a lower-level same-provider rotation layer.
- Session export: Vanta has UI export actions for markdown, JSON, and text.
- Public API/programmatic integration: covered by existing API/SDK and ACP cards.
- MoA: covered by the shipped mixture-of-agents path.

## Roadmap Cards Added

- `HERMES-PROFILE-DISTRIBUTIONS` - shipped 2026-07-11
- `HERMES-AUTOMATION-BLUEPRINT-CATALOG` - shipped 2026-07-11
- `HERMES-CONTEXT-REFS-V2` - shipped 2026-07-11; rendered Composer acceptance covers typed refs, receipts, warnings, and hard limits
- `HERMES-CREDENTIAL-POOLS` - shipped 2026-07-11
- `HERMES-PLUGIN-LLM-LANE` - shipped 2026-07-11
- `HERMES-DELIVERABLE-AUTO-ATTACH` - shipped 2026-07-11

## Build Priority

All six extracted cards shipped on 2026-07-11. The next local reliability work comes from
the 2026-07-12 delta audit: effect disposition first, then real-headroom compaction.

## Guardrail

Do not clone Hermes wholesale. The useful extraction is workflow packaging: durable profiles, installable specialists, low-friction automations, safer credentials, explicit context, bounded plugins, and native deliverables. Vanta should keep the local-first kernel and receipt posture as the differentiator.
