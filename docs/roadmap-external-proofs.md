# Roadmap external proof status

`vanta roadmap proof-status` evaluates every parked external-proof card from
durable evidence. It exits `0` only when all ten gates pass and exits `1` while
any receipt is absent or invalid. Use `--json` for release automation:

```bash
vanta roadmap proof-status
vanta roadmap proof-status --json
```

Once a gate is ready, consume its receipt and close the parked card through the
guarded acceptance command:

```bash
vanta roadmap proof-accept <card-id>
vanta roadmap proof-accept --all-ready
```

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
