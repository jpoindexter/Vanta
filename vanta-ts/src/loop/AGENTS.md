# AGENTS.md — vanta-ts/src/loop

Durable first-class loop engine: definitions, mutable state, trigger evaluation, staged iteration, verification, stop rules, and scoped wake context.

- `types.ts` owns Zod schemas for loop defs/state plus `WakeContext`.
- `wake.ts` owns wake context formatting, env encoding, and the durable event queue. Use it when a gateway/CLI path needs to wake a loop without replaying full history.
- `store.ts` is the only loop file persistence layer; keep ids filename-safe.
- `runner.ts`, `stages.ts`, `verify.ts`, and `stop.ts` are pure/injected where possible. Do not call providers or shell directly from them.
- Escalations are human-clear-only blockers. Agents may read them; only CLI/operator paths clear them.
