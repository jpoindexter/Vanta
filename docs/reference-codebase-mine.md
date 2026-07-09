# Reference Codebase Mine

Captured: 2026-07-09

This closes `CODEBASE-MINE`: the reference repos were used as quarries, not as parity targets.
The rule is adapt patterns that strengthen Vanta's local, kernel-gated operator model; cut
platform/cloud/SaaS assumptions that fight it.

## Goose

Source checked: `reference/goose/README.md`, `docs/use-case-audit.md`, `docs/issues-map.md`.

Adapt:
- Native local app + CLI + API posture: keep Vanta installable locally and runnable from terminal, desktop, and automation surfaces.
- Provider breadth and MCP extension shape: Vanta already maps this through provider adapters, MCP mount/serve, and the plugin/runtime registry.
- Custom distribution idea: use Vanta modes, setup profiles, and plugin bundles rather than forking the app.

Cannot use directly:
- Goose's broad extension ecosystem as a goal by itself. Vanta's safety kernel and user-specific operator loops matter more than extension count.
- Desktop-first packaging as the next move without a validated Vanta operator UX.

Missing after comparison:
- Packaging polish and native desktop lifecycle remain useful, tracked under `DESKTOP` / `DESKTOP-P12`.
- Some adapter breadth is still credential/platform-gated, tracked as messaging/channel cards.

Cut:
- Multi-user/platform ecosystem work before a single-operator workflow proves demand.
- Extension-count chasing; Vanta uses curated modes/skills/plugins instead.

## Hermes / Reference Agent

Source checked: `reference/hermes-agent/README.md`, `docs/agent-map.html`, `docs/argo-flow.md`,
`PARKED.md`, `docs/messaging-channel-parity.md`.

Adapt:
- Hermes-style operator surface: capability home, visible workflows, ambient context, life search, autonomy contracts, trust ledger, standing sentinels.
- Gateway pattern: one gateway with platform adapters, verification ledgers, and capability descriptors.
- Learning loop shape: memory, skills, session search, curated skill hub, and post-run receipts.
- Runtime flow: stable prompt tier, context tier, volatile goal tier, compression, retry, bounded iteration, and provider catalog.

Cannot use directly:
- Cloud/serverless terminal backends as a default. Vanta remains local-first unless the operator explicitly opts into remote infrastructure.
- Tool Gateway / subscription bundle assumptions. Vanta keeps bring-your-own-provider and local defaults.
- Full messaging breadth as table stakes. Each adapter needs real operator demand or credentialed verification.

Missing after comparison:
- Full command center remains a large horizon item; first slices are already shipped through Launch Pad, operator home, life search, ambient context, and autonomy views.
- Native desktop lifecycle is still open under `DESKTOP-P12`.
- Some loop/cofounder ideas remain horizon because they need real eval signals, not just harness code.

Cut:
- Batch trajectory/datagen as runtime product work.
- Account/subscription/web dashboard platform moves that contradict local-first Vanta.
- Multi-company or multi-human supervision until the single-operator system is proven.

## Software Factory References

Source checked: `docs/factory-evolution.md`, `docs/self-repair-architecture.md`,
`docs/loop-engineering-plan.md`.

Adapt:
- Holdout acceptance checks, intent-satisfaction judging, ambiguity preflight, cost ledger, bounded retry, and work-item closure.
- Born-small codegen discipline: new capability as a new file behind a registry, with tests and size gates.
- Self-repair boundary: improve limbs freely, propose/prove/swap safety-critical core changes.

Cannot use directly:
- Greenfield spec-to-app assumptions as the primary factory model. Vanta's core factory problem is brownfield self-modification.
- Heavy multi-mind ceremony for small repairs.

Missing after comparison:
- Stronger live eval corpus before self-evolution is allowed to make broad autonomous changes.
- Better intent verification remains a standing factory concern.

Cut:
- Full black-box Level-5 autonomy. Vanta is an operator collaborator with a hard kernel boundary.
- Digital-twin validation worlds unless a concrete external-system workflow demands them.

## Roadmap Items Produced Or Confirmed

- Shipped/confirmed slices: `WHAT-CAN-I-DO-GALLERY`, `OPERATOR-HOME-V1`, `SPEC-TO-APP-WIZARD`, `AUTONOMY-CONTRACT-WALLS`, `TRUST-LEDGER-AUTONOMY`, `STANDING-GOAL-SENTINEL`, `LIFE-SEARCH`, `AMBIENT`, `HARNESS-THICKNESS-AUDIT`.
- Horizon items to keep: `DESKTOP-P12`, `COMMAND-CENTER`, `VANTA-KANBAN`, `AHE-INTERACTION-AWARE`, `PCLIP-*` cofounder/learning items.
- Parked by thesis: multi-company, multi-user, SaaS/cloud default execution, extension-count chasing, broad messaging adapter parity without credentialed demand.

## Verdict

The mined sources have been converted into concrete Vanta roadmap work. The remaining value is
execution on existing cards, not another broad reference read.
