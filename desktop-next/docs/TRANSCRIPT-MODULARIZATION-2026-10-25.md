# Authoritative transcript seam — 2026-10-25

Source-only follow-on; installed745629c6 is unchanged. This does not complete
Desktop modularization, transcript parity or owner visual approval.

Two authoritative reconciliation wrappers moved from use-session-actions/index.ts
to feature-local authoritative-transcript.ts. Bodies are byte-identical apart
from export keywords. All seven callers remain unchanged. Order remains:
persisted live-turn anchor, otherwise live projection, then durable history.
The raw-row wrapper still calls toChatMessages before that same reconciliation.
Independent live-projection/persisted-turn imports remain in index.

Index3464→3431lines; new module38lines. Existing session/state/gateway and helper
monoliths remain. No new global store, abstraction, state owner or runtime feature.

Executed:27tests/sixfiles with real collaborators, including anchored repeated
correction/queued occurrences, no-anchor fallback, input immutability, streaming
reply retention, empty-prose resume, structural resume and transcript provenance.
Renderer typecheck and all five architecture boundaries pass.

The first new fixture lacked a stable timestamp; fixing only its timestamp made
display IDs deterministic. No runtime behavior was changed to satisfy it.
No actual Electron resume/switch or fresh package is claimed by these tests.
Keep broad roadmap cards open; actual installed acceptance remains a later gate.
