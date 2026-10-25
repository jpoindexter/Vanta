# Mail failures remain unknown, not confirmed — 2026-10-25

Delivery follow-on: source745629c6 installed. Actual installed adapter/effect
modules execute unknown/no-retry proof with zero network calls. Private bundled
sendGatewayMessage is not exported; its full SOURCE proof remains separate.
See PARALLEL-DELIVERY-2026-10-25.md; no live SMTP/recipient verification implied.

## Reproduced cause

EmailAdapter and its live SMTP transport each swallowed outbound exceptions.
The shared effect gateway then received a resolved void and durably recorded
confirmed/unverified. An injected throwing transport through the actual
EmailAdapter → sendGatewayMessage → executeEffect path reproduced this;
same-key replay resolved again without attempting another send. At-most-once
claiming worked, but the outcome was false.

## Small correction and scope

Remove the two outbound catch/swallow blocks. Leave tolerant inbox polling,
shared effect API, kernel/approval decisions and idempotency unchanged.
Exceptions now reach executeEffect's existing unknown settlement. A consumed
unknown send is never automatically retried. SMTP success remains confirmed /
unverified, not recipient delivery or mailbox readback.

Caller inventory: registry constructs EmailAdapter with imapSmtpTransport;
gateway message sending goes through effect-send; stream execution awaits its
final send. EmailTransport is otherwise used by its adapter tests. No broad
adapter rewrite, new wrapper, dependency or public API change. Wire tests now
mock both dynamic clients instead of assuming installed dependencies absent.

## Executed evidence

- Durable receipt regression: red before (false resolution), green after.
-58 tests/five files pass: Email38, durable receipt3, stream sink3, stream run2,
  shared executeEffect12. Covers denial/no send, success/unverified, failure /
  unknown, consumed-key no retry and no raw body/error in receipts.
- Whole-runtime typecheck exits0; scoped diff check passes.
- Direct source execution, injected rejecting SMTP with a socket guard:
  zero sockets, one attempt across two calls, both return generic
  `gateway effect unknown`; one unknown/unverified receipt and settled unknown
  claim. Receipt: `proofs/mail-receipts-2026-10-25/direct.json`.

No real account, credential, external email or provider delivery was tested.
An earlier exploratory mock did not intercept ESM and may have attempted a
refused loopback connection; it is not cited as a no-network or wire proof.
The explicit injected/socket-guard run and mocked wire tests are separate.

This is source evidence, not yet a rebuilt installed runtime. Installed app
identity remains in SECURITY-DELIVERY-2026-10-25.md until a combined delivery.
Other platform adapters and broad trust/roadmap cards are not closed by this
slice. Existing unrelated work is preserved; no main merge/release/tag.
