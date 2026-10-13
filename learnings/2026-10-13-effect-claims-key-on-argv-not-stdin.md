# Moving a prompt from argv to stdin makes every launch the same effect

Date: 2026-10-13 · Area: worker runtimes, effect gate

`runExternalAgent` wraps a launch in `executeEffect`, whose idempotency key is
`external-agent:<operationId|sessionId|"one-shot">:<sha256(command+args)>`. With the prompt in argv
every ticket hashed differently. Once the prompt moved to stdin (so it stays out of `ps`), the argv for
two Claude Code launches was identical, the second launch hit a settled claim and was reported as
"refused by the effect gate" without running anything. The first end-to-end test passed because it only
launched once; the "Always skips the card next time" test caught it.

How to apply: give every launch its own `operationId` (`worker-run:<runId>`) in the `EffectGateContext`.
The prompt is then bound only by the sha256 in the approval action, not by the effect payload; say so in
the docs instead of implying the effect hash covers it.
