# Roadmap external proof status

`vanta roadmap proof-status` evaluates every parked external-proof card from
durable evidence. It exits `0` only when all ten gates pass and exits `1` while
any receipt is absent or invalid. Use `--json` for release automation:

```bash
vanta roadmap proof-status
vanta roadmap proof-status --json
```

Use `proof-packet` when you need the same checklist as a handoff artifact
without failing the shell while receipts are still missing:

```bash
vanta roadmap proof-packet
vanta roadmap proof-packet --json
vanta roadmap proof-export
vanta roadmap proof-export --out .vanta/external-proofs/proof-packet
```

`proof-packet` never marks a card ready and never changes roadmap state. It
prints the current gate evidence, receipt paths, and next actions, then exits
`0` so it can be attached to a task, sent to an operator, or archived before the
external work is available. `proof-status` remains the hard release gate.

`proof-export` writes that same handoff packet to a local repo-bound folder:
`proof-status.json`, `NEXT.md`, `checklist.md`, `README.md`, one
`runbooks/<CARD>.md` file per external-proof gate, and acceptance-packet
templates for the payment, Shopify, and telephony gates. `NEXT.md` points at
the first non-ready leaf gate so operators do not have to choose from ten
parallel blockers. The export path must stay inside the repository.

`vanta roadmap status --open --actionable` is intentionally narrower than
`--open`: it excludes parked `external proof` cards. Those cards still count as
open release work and keep `--require-complete` failing, but they no longer
look like local code tasks when the only remaining steps need credentials,
accounts, devices, or a real third-party host.

Once a gate is ready, consume its receipt and close the parked card through the
guarded acceptance command:

```bash
vanta roadmap proof-template HERMES-SHOPIFY-OPERATIONS <receipt-event-id>
vanta roadmap proof-accept <card-id>
vanta roadmap proof-accept --all-ready
```

`proof-template` prints the exact external-acceptance packet skeleton for the
packet-based commerce and telephony gates. Use it for
`HERMES-PAYMENT-SKILL-PACK`, `HERMES-SHOPIFY-OPERATIONS`, or
`HERMES-TELEPHONY-CONSENT-LIFECYCLE` after the real provider receipt IDs exist.

`proof-accept` cannot override a missing receipt. It only accepts canonical
external-proof cards, requires every `after` dependency to be shipped, removes
`parkedReason`, records the accepted receipt and evidence in the card notes,
and regenerates the roadmap. `--all-ready` accepts ready child cards before
their aggregate release gates. Use `--json` for automation.

The report reuses the existing Modal/Telegram, Teams, and physical Termux
receipts, then checks these additional gates:

| Card | Canonical evidence |
| --- | --- |
| `RUN-ANYWHERE-V1-RELEASE-GATE` | All three Run Anywhere child receipts |
| `HERMES-SPREADSHEET-COPILOT` | `.vanta/spreadsheet/host-proof.json` plus its referenced workbook-action receipt |
| `MERCURY-CROSS-PLATFORM-SERVICE` | `vanta-ts/.artifacts/service-proof-win32.json` with `platform: "win32"`, `ok: true`, and log capture |
| `HERMES-PAYMENT-SKILL-PACK` | Final Stripe Link and MPP ledger events plus a matching external-acceptance packet |
| `HERMES-SHOPIFY-OPERATIONS` | Verified mutation ledger event plus a matching external-acceptance packet |
| `HERMES-TELEPHONY-CONSENT-LIFECYCLE` | Number, SMS, call, callback, and recording-deletion events plus a matching external-acceptance packet |
| `HERMES-COMMERCE-TELEPHONY-SKILL-PACK` | All three commerce/telephony child gates |

For `BACKEND-SERVERLESS-LIVE`, deployment alone is not readiness. Run
`vanta backend gateway status --json`: the Telegram token must report `valid-format`,
the webhook must have a distinct `registeredAt` receipt, and the app must be
idle at zero tasks before arming. Placeholder tokens report `invalid-format` and
`register-telegram` refuses them before making a Telegram request. The card
ships only after `arm` and `prove` observe a real wake, provider-backed reply,
and return to zero tasks.

`proof-status` and `proof-packet` mirror that same stage gate for the serverless
card. When the local token is missing or has placeholder syntax, the packet names
that setup fix first and does not ask the operator to arm, send, or prove a wake
path that cannot succeed yet.

## External acceptance packet

Provider fixture receipts are candidates, not live acceptance. Payment,
Shopify, and Twilio proof runners must write a separate packet under
`.vanta/external-proofs/<ROADMAP-CARD-ID>.json` that binds the external evidence
to exact receipt event IDs:

```json
{
  "version": 1,
  "ok": true,
  "roadmapCardId": "HERMES-SHOPIFY-OPERATIONS",
  "environment": "external-test",
  "executedAt": "2026-07-11T00:00:00.000Z",
  "evidenceSha256": "64-lowercase-hex-characters",
  "receiptEventIds": ["00000000-0000-4000-8000-000000000000"]
}
```

The evidence file itself must be redacted before hashing and must never contain
tokens, card data, customer data, phone numbers, message content, or provider
response bodies. A packet does not authorize an operation; it records an
already approved and executed test-account acceptance path.

Spreadsheet host packets additionally require `host` (`excel` or
`google_sheets`), `apiSessionId`, `approvalGatedAction: true`,
`workbookReceipt`, and `evidenceSha256`. Referenced workbook receipts must stay
inside the repository; absolute and parent-traversing paths are rejected.

Run `vanta roadmap unblock <card-id>` for the exact account, host, command, and
receipt steps needed to create each proof.
