# Named delegation routes — Hermes comparison and Vanta adoption card

Owner: Jason. Decision: record the useful advanced-delegation pattern without
interrupting Desktop delivery, adding another agent runtime, or granting new
account access. This is research and roadmap work, not installed functionality.

## Source and evidence boundary

Reviewed the [Hermes catalog entry](https://hermes-agent.nousresearch.com/docs/plugins/advanced-delegation)
and its pinned plugin at
[`e404b6816b20237a82f6fbe2749b5a576cf75dba`](https://github.com/NousResearch/hermes-official-plugins/tree/e404b6816b20237a82f6fbe2749b5a576cf75dba/advanced-delegation).
The catalog advertises version 1.0.0 and Hermes >=0.22.5; that requirement is for
Hermes, not a Vanta compatibility claim. The plugin license at this pin is MIT.
No plugin was installed, no upstream source was copied, and no model/account
was invoked. GitHub's tree page failed to fetch in the web reader; the pinned
directory listing was independently read through GitHub's contents API.

Source inspection found three useful seams:

- [`model_map.py`](https://github.com/NousResearch/hermes-official-plugins/blob/e404b6816b20237a82f6fbe2749b5a576cf75dba/advanced-delegation/model_map.py): configured route labels become enum choices; provider details stay behind resolution.
- [`profile_routes.py`](https://github.com/NousResearch/hermes-official-plugins/blob/e404b6816b20237a82f6fbe2749b5a576cf75dba/advanced-delegation/profile_routes.py): a separate named-profile selector, not another worker lifecycle.
- [`slash.py`](https://github.com/NousResearch/hermes-official-plugins/blob/e404b6816b20237a82f6fbe2749b5a576cf75dba/advanced-delegation/slash.py): distinguish saved mode from this chat's effective mode; applying changes now is explicit.

The [pinned README](https://github.com/NousResearch/hermes-official-plugins/blob/e404b6816b20237a82f6fbe2749b5a576cf75dba/advanced-delegation/README.md)
also warns that profile delegation can use that profile's credentials and
terminal policy. That authority expansion is not an adoption default for Vanta.
These are inspected/reported contracts, not independently executed Hermes proof.

## Existing Vanta seams — inspected, not recertified

- `vanta-ts/src/tools/delegate.ts` already accepts provider/model and agent type,
  spawns through the current worker runner, and records delegation evidence.
  Its inspected schema does not provide this named-route contract.
- `vanta-ts/src/routing/auto-router.ts` and `routing/model-router.ts` already
  classify tasks and select configured models. Extend them; do not replace
  the agent loop or create another routing configuration database.
- `vanta-ts/src/subagent/delegation-receipt.ts` records model, usage and estimated
  cost. Named policy/version and full effective routing still need a deliberate
  mapping to the existing all-call usage ledger.
- Desktop already groups `delegation.*` settings. Reuse that surface and the
  existing CLI setup/routes entry points instead of another technical panel.

Historical shipped cards `AUTO-ROUTER`, `O1`, `SUBAGENT-PROVIDER-IDENTITY`,
`HERMES-PROFILE-ROSTER` and `HERMES-DELTA-USAGE-ROUTE-LEDGER` remain unchanged.
They are dependencies, not proof this new combined capability is delivered.

## Canonical card and implementation sequence

New card: **DELEGATION-NAMED-ROUTE-CONTRACT**. Parked behind current Desktop,
state recovery and routing prerequisites. The active twelve-card queue and two
Building lanes do not expand. Review for promotion after dependency acceptance,
not merely because an upstream plugin exists. No promised delivery date.

Trello projection: [Named delegation routes](https://trello.com/c/cmgnbJC6).

1. **Engine policy.** Add an owner-configured label/description contract to the
   existing delegate/router seam. Configuration is validated before saving and
   before spawn; only configured names reach the model. Preserve current
   unconfigured behavior. Expose exact effective policy and reject stale choices.
2. **Shared setup.** Desktop and CLI/TUI edit and display the same policy. Reuse
   existing model pickers, menus, keyboard patterns and `/routes` where suitable.
   Default, model-route and specialist-profile choices preserve inactive
   settings. Changes normally start with the next chat; explicit current-chat
   application requires supported, acknowledged tool-schema refresh and a clear
   cache-cost notice. Never claim an unsupported refresh succeeded.
3. **Receipts and proof.** Extend current worker/usage evidence with requested
   label, policy revision, effective provider/model/effort/tier/profile, allowed
   fallback, stop reason and known/unknown cost. No secret or full prompt in a
   new public receipt. Keep existing summary/sidechain boundaries and cancellation.

## Vanta-specific acceptance and guardrails

These are proposed requirements, not claims about upstream behavior:

- A fixture demonstrates configured fast/deep/local selection, explicit default
  and unchanged unconfigured behavior. The main agent remains on the user's
  selected model. No hardcoded recommendation for a currently cheapest model.
- Invalid or duplicate names, missing providers/profiles, unsupported effort or
  tier, disabled routing and stale session choices stop before worker/network
  effects. An endpoint or model invented in tool arguments cannot override a
  configured route. Malformed policy cannot silently become a permissive default.
- A local/private route never falls back to a cloud endpoint without separate
  owner-approved policy. Apply inherited time/turn/token/cost/concurrency limits
  across the whole batch, not a fresh budget for each child. Unknown spend is
  visible, not reported as free. Local execution is not assumed to be zero-cost.
- Specialist profiles are explicit opt-in and remain blocked until exact native
  profile ownership/restart behavior is proven. A profile pick cannot expand
  the parent's approved accounts, tools, terminal scope, filesystem access or
  standing grants; test the intersection and revocation of those boundaries.
- A real source then packaged Desktop/CLI run proves save, next-chat behavior,
  explicit supported apply-now, restart continuity, cancellation, receipts and
  refusal paths without lost drafts or duplicate effects. Live paid providers
  and credential-bearing profiles require separate owner approval.

Do not copy plaintext inline keys, silent provider/price/privacy escalation,
unbounded fan-out, permissive profile credentials, or Hermes's plugin/core as a
replacement Vanta engine. If implementation later reuses MIT source, retain its
copyright/license notices and review dependencies at the actual implementation pin.

No application test suite was run for this documentation-only adoption update.
Validation is roadmap parsing, unique IDs/dependencies/cycles, unchanged prior
records/capacity, generated projections, diff/secret checks and Trello readback.
The interrupted Desktop candidate remains separately preserved in
`Vanta-backups/draft-pending-20261026-vbz1Cd/REENTRY-2026-10-26.md`.
