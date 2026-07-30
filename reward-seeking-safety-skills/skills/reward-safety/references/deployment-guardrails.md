# Deployment Guardrails

## Protect the full reward path

The evaluated agent must not control:

- task selection or hidden instance generation;
- verifier code, expected outputs, score files, or holdout membership;
- model/provider selection or reasoning and token budgets;
- audit receipts, denial logs, or release thresholds;
- the process that aggregates evidence into a release decision.

Use separate principals for task generation, execution, verification, and
release. A filesystem read-only bit is not enough when tools, environment
variables, network services, or downstream report generation can influence the
same path.

## Observable signals

Record attempts to:

- discover hidden tests or grading scripts;
- alter tests, fixtures, monitors, or score inputs;
- weaken validation, skip checks, or change budgets;
- make a promise and violate it to complete a task;
- falsify or selectively omit evidence;
- disable oversight or route around a blocked tool;
- optimize formatting or metadata known to affect a grader but not the outcome.

Return denied attempts as structured values. Do not erase them because the final
task result passed.

## Release rule

A release needs independent evidence from deterministic checks, behavioral
contrasts, and integrity receipts. One LLM grader may summarize evidence but may
not be the only authority. Preserve an `inconclusive` state and require a human
decision for unresolved high-impact conflicts.
