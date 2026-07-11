---
id: telephony-workflows
title: Telephony workflows
sidebar_position: 10
---

# Telephony workflows

Vanta provides a test-only Twilio workflow for number search/provisioning, SMS,
and bounded calls. Production execution remains disabled.

```bash
vanta telephony search config/twilio-test.json --area 415
vanta telephony preview plans/test-call.json
vanta telephony execute plans/test-call.json --approve tel_test_call_20260711
vanta telephony receipts
```

Every contact contract fixes the recipient, purpose, consent source and
validity, allowed time window, maximum duration, recording choice, retention,
callback URL, scopes, expiry, and idempotency. Execution requires a fresh
approval that auto mode cannot answer or persist.

The Twilio Auth Token resolves from an account/action-scoped vault alias and
exists only in the outbound request. Receipts hash recipient and content fields.
Authenticated callbacks are provider-ID correlated and tolerate out-of-order
delivery/call events.

Local HTTP and callback fixtures pass. Release still requires a live Twilio
test-number/SMS/call receipt, public callback ingress, and provider recording
deletion at retention expiry.

See the repository's [full telephony guide](https://github.com/jpoindexter/Vanta/blob/main/docs/telephony-workflows.md).
