# Route a cost lever only after the ledger can see the calls it moves

Context: the plan was "send the background forks to a cheaper model". Reading the ledger writer showed only the main agent loop wrote route-ledger rows (`agent/provider-usage.ts`); the seven post-turn forks called `provider.complete()` directly, so their spend was not in the ledger at all. A `purpose` field alone would have labelled nothing.

Approach that worked: one decorator (`routing/fork-provider.ts`) does both jobs at the single place the forks get their provider: it picks the routed provider through the existing aux ladder and writes the ledger row with the purpose. The forks changed by one argument each; nothing in their prompts or parsers moved.

Details that mattered:
- Resolve lazily. Some forks gate themselves internally (dialectic), so resolving at call-site entry would warn about a bad override on turns where no model call happens.
- A wrong model id is only discoverable when the endpoint rejects it, not at resolve time. The unresolved-provider case and the rejected-call case both end in one warning and a main-model retry marked `fallbackDepth 1`, skipped when the caller aborted.
- Unset plus no ledger returns the main provider object itself, so there is no wrapper to differ from.

Check that proves it: `scripts/fork-route-smoke.mjs` runs a real `vanta run` against a local OpenAI-compatible stand-in three ways (override set, unset, override the endpoint 404s) and asserts on the ledger file and on which model the endpoint actually received.

Gap to remember: one-shot `vanta run` exits right after the awaited review fork, so fire-and-forget forks (completion verifier, fact extractor) can lose their ledger row there; the smoke run only proves the review fork.
