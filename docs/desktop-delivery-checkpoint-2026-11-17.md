# Desktop delivery checkpoint — 17 November 2026

This records the delivered reliability slice, not completion of every Desktop,
agent or canonical roadmap criterion.

## Executed delivery

| Surface | Observed evidence |
| --- | --- |
| Installed app | Normal `0.1.3`, source `b2847a8f6665a5294d25478dd3cb20ac140a5da6`; actual owner-approved native replacement and automatic relaunch, retained history and unsent synthetic text/file |
| App identity | Fingerprint `85516a24e84ea57fd80f1f76353879ec616366760745026f1ea26cd009030797`; ASAR `41d95a82d7a2c121b0ee99daf11fccb58eec6b188d38274718d297031d40cdde`; installed signature, staple and Gatekeeper passed |
| Recovery | Private owner app/data backups and publisher-verified native app rollback retained; no profile reset, credential/grant migration or backup deletion |
| DMG | Signed/notarized/stapled; public download hash `1e75aa1653498ea668464816c5bf82239c1f06e021914a46344f4fa5ccc21f5a`, mounted payload/Applications shortcut checked; installed public-DMG copy passed seven first-launch assertions over three private launches, one explicit canned request and zero renderer errors |
| Live manifest | SHA `555b1742ff9d0328fd5206818925be65f492fed9e2d3a2cf2d0d999a58ce6d24`; published checksums agree; production discovery accepted it, offered 0.1.3 to 0.1.0 and offered no update/downgrade to 0.1.3/0.1.4 |
| Documentation | Delivery/help checkpoint `e57e5948fb40ed75c7b4a0485e268b0a38111249` pushed; production Docusaurus build passed; existing Cloudflare Pages deployment `571d773e` published that content |
| Public readback | HTTPS 200 with expected version/help content on `docs.vanta.theft.studio/`, `/desktop-help`, `/desktop-and-tui` and `vanta.theft.studio/`; no browser-rendering claim from HTTP alone |
| Roadmap | All 1,372 records, ordered IDs, statuses, Done criteria and dependencies preserved; exactly seven existing notes extended; generated projections checked |
| Trello | Native-update first three proof items and DMG delivery items checked; unresolved acceptance left open. Added missing board projections of two existing canonical MCP/delegation cards, not new product scope or WIP |

The deployed content advertises Desktop DMG 0.1.3, while GitHub global Latest
remains CLI/kernel `v0.9.8`. Protected `main` was not merged or bypassed; source
and delivery documentation are on `codex/desktop-feedback-20261117`. The app
binary intentionally retains its exact source pin; subsequent docs-only commits
are not a different app build.

## Preserved limits and next work

- Complete native failure/offline/rollback execution and late asynchronous
  handoff-error presentation remain on the existing updater card.
- Original tester attachment input/cause, corrupt TIFF, complete accessibility,
  clean-Mac and unfamiliar-person acceptance are not cleared by these checks.
- An unresolved retained request can block sending while Send looks enabled;
  help explains Restore without sending, but the affordance still needs work.
- GitHub reported 212 default-branch dependency alerts during the push: four
  critical, 98 high, 90 moderate, 20 low. No whole-product security claim.
- No fresh screenshots in the hidden public-DMG replay, full suite, live/paid
  cloud model, outreach, microphone or additional feedback send was used there.

The [bounded Hermes refresh](hermes-delivery-priorities-2026-11-17.md) identifies
the small known-expired MCP token readiness defect as the next agent reliability
slice after delivery; reconnect duplication requires a failing Vanta reproducer,
and unfinished delegated-child inspection is later work. No upstream shell,
plugin catalog or runtime was installed or copied.

[Release and checksums](https://github.com/jpoindexter/Vanta/releases/tag/desktop-v0.1.3)
· [Detailed package evidence](releases/desktop-v0.1.3.md)
· [Live Desktop help](https://docs.vanta.theft.studio/desktop-help)
· [Recovery board](https://trello.com/b/dDzFD7VZ/vanta-agent-desktop-recovery)
