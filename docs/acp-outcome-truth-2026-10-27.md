# ACP outcome classification — 2026-10-27

Source checkpoint only. The delivered normal CLI remains pinned to `2f39a2b0`;
the installed Desktop remains home1. Neither contains this later source change.

## Cause and bounded change

The real ACP runner discarded `needsEffectReview` and mapped `blocked` to the
normal `end_turn` response. It now passes the outcome to the existing mapper and
returns ACP's existing `refusal` value for blocked/review-required outcomes,
as defined by the [official v1 stop reasons](https://agentclientprotocol.com/protocol/v1/prompt-turn#stop-reasons).
Interrupted/soft-stopped outcomes retain `cancelled`; ordinary completion,
iteration limits and repeated failures retain their existing mappings. No new
protocol field, dependency, permission, retry or effect path was introduced.

## Executed evidence

Parent packet: `acp-outcome-parent-20261027-p7EdRr`. Reviewed frozen worker
packet: `acp-stop-reason-20261027-juQnLW`, patch SHA256
`24a62b4b0aa6115e6bbf872f61e59c09d6f1867eaae34c27068c33886fe0f19f`.

- Parent ran the actual ACP stdio server/client with real conversations on normal
  CLI Node 22.23.1. The retained baseline reports uncertain work as `end_turn`;
  current canonical source reports `refusal`.
- Both lifetimes preserve ordinary `end_turn`, actual cancellation as `cancelled`,
  one deliberately partial local fixture effect, zero follower executions, the
  human-review warning and natural exit zero.
- Both retain two completed route-usage rows, each seven input/three output
  tokens; the cancelled provider wait does not invent completed usage.
- All 88 focused ACP checks across nine files pass, including contradictory
  `done` plus review-required, blocked without a review flag and cancellation
  precedence. Supported runtime typecheck and strict source/test size checks pass.

The model and safety verdicts are injected private fixtures. This executes the
classification boundary, not a real account, Rust-policy acceptance or owner
profile. Usage remains internal: Vanta's current ACP bridge emits no usage update, and this
conversation path emits no `turn_end` event. No new metering claim is made.
ACP session continuity, delegated/background outcome propagation, automatic
retry safety and installed delivery need their own evidence. No whole roadmap
card, security gate or product acceptance is closed by this checkpoint.
