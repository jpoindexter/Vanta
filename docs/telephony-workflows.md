# Telephony workflows

Vanta wraps the existing Twilio SMS transport with a test-only telephony
contract for number search/provisioning, SMS, and bounded outbound calls. Live
Twilio execution is disabled unless an explicit test API base is configured.

## Profile

```json
{
  "version": 1,
  "environment": "test",
  "provider": "twilio",
  "accountSid": "AC00000000000000000000000000000000",
  "authTokenVaultAlias": "TWILIO_TEST_TOKEN",
  "from": "+15005550006",
  "scopes": ["numbers", "sms", "voice"]
}
```

The Auth Token stays in Bitwarden or 1Password. Grant the alias to only the
needed account/action scopes:

```bash
vanta secrets vault add TWILIO_TEST_TOKEN \
  --backend 1password \
  --ref op://Vanta/twilio-test/token \
  --scope telephony:twilio:AC00000000000000000000000000000000:numbers,telephony:twilio:AC00000000000000000000000000000000:sms,telephony:twilio:AC00000000000000000000000000000000:voice
```

## Number search

```bash
vanta telephony search config/twilio-test.json --country US --area 415 --limit 5
```

Search is read-only and returns only the phone number, friendly label, and
capability flags. Provisioning a selected number is a separate contract and
fresh approval because it can create recurring cost.

## Contact contract

Every SMS or call fixes:

- E.164 recipient and sender
- one stated purpose
- consent source, obtained time, and expiry
- allowed start/end window and contract expiry
- unique action ID and UUID idempotency key
- status callback URL
- receipt/transcript retention days
- for calls, spoken message, maximum duration, and explicit recording choice

```bash
vanta telephony preview plans/test-sms.json
vanta telephony execute plans/test-sms.json --approve tel_test_sms_20260711
vanta telephony receipts
vanta telephony prune config/twilio-test.json --yes
```

The CLI accepts only the exact action ID. The `telephony_workflow` tool asks
again with a fresh approval that auto mode cannot answer or persist. Vanta
rechecks consent, time window, scope, expiry, and replay under a receipt lock
before contacting the provider.

SMS forms reuse the shipped gateway's `buildSmsForm` path, then add a Twilio
`StatusCallback`. Calls use generated, XML-escaped TwiML, explicit
`TimeLimit`, all progress callbacks, and recording off unless the contract
includes separate recording consent/disclosure/retention. Number provisioning
sets the exact number plus fixed voice/SMS webhook URLs.

## Callbacks and retention

The callback service validates the full URL plus every form field against
`X-Twilio-Signature` using Twilio's documented HMAC-SHA1 algorithm and a
constant-time comparison. Its tests match Twilio's published signature vector.
Message, call, and recording events are account/provider-ID correlated. Status
summaries rank terminal states above earlier events, so a late `sent` callback
cannot replace an already received `delivered` callback.

Mode-`0600` receipts store hashes for recipient, purpose, and action content;
they do not store phone numbers, SMS body, spoken text, Auth Token, or recording
URL. The retention command deletes due Twilio recordings through the scoped
voice credential before pruning local receipt events after their deadline.

## Proof status

Real local HTTP fixtures have executed number search, SMS, call, and number
provision requests while proving Basic Auth remains request-only. Signature,
account mismatch, invalid signature, callback correlation, out-of-order status,
replay, denial, fresh approval, and local retention tests pass.

The callback ingress is available through `vanta telephony ingress <profile>
--public-url https://host/twilio`; place it behind an HTTPS reverse proxy. The
card remains blocked because no `TWILIO_TEST_TOKEN` vault alias/test account is
configured, so live number/SMS/call/callback/recording-deletion proof has not
run. Vapi and Bland remain optional future adapters behind this contract.
