# Context classification

Classify each candidate instruction using its full source and precedence.

| Label | Meaning | Default action |
| --- | --- | --- |
| Conflict | Two applicable instructions require incompatible behavior. | Resolve authority and retain one explicit rule. |
| Duplicate | Equivalent guidance appears in more than one loaded layer. | Keep the most authoritative, specific source. |
| Obvious | Generic advice adds no repository knowledge or enforceable boundary. | Remove or replace with a concrete reference. |
| Model-handled | Guidance compensates for an old model failure and has a verified replacement. | Test without it, then remove if behavior holds. |
| Gotcha | Non-obvious repository, safety, compatibility, or operational fact. | Keep concise and explain why. |
| Procedure | A multi-step workflow that is not relevant to every task. | Move to an on-demand skill. |
| Deterministic | A rule is better enforced by code, schema, test, or hook. | Implement the control, then remove repeated prose. |

Do not infer precedence from file names alone. System/developer authority, local
repository policy, the user’s current request, and the runtime’s actual loading
order all matter. Mark anything not verified as `unverified`.
