# Messaging Channel Parity

Status: parity adapters are built; verification is an operator-run ledger.

`vanta gateway verify-channels` checks every cataloged messaging adapter, writes a JSON ledger under `.vanta/channel-verification/`, and reports one of:

- `live`: adapter was configured and completed `connect/poll/disconnect`.
- `not-configured`: required environment is missing.
- `failed`: configured adapter threw or timed out during verification.
- `missing-adapter`: catalog entry has no registered adapter.

Decision: native mobile nodes and a shareable channel/skills ecosystem stay out of this parity card. Track native mobile separately via `PLATFORM-MOBILE-TERMUX`; treat shareable channel packages as a future ecosystem/distribution card.
