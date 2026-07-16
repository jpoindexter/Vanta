# Schema State Grounding

Status: shipped 2026-07-17

## Outcome

Vanta can now turn a typed task transition's raw observation into an inspectable `GroundedState`. The representation separates immutable observed history from revisable interpretation.

Grounded states include:

- stable entities with typed properties, relations, and affordances;
- counters for task-level variables;
- confidence constrained to the closed zero-to-one range;
- field and entity provenance tied to run ID, transition sequence, adapter, and source path;
- a representation version, revision ledger, superseded field values, and superseded entities.

`diffGroundedStates` compares semantic entity values rather than provenance timestamps, so an unchanged entity retains its identity while real property and counter changes remain visible.

## Counterexample Revision

`reviseGroundedState` returns a new representation and never edits the transition event or prior grounded state. A counterexample can:

- add a missing property;
- replace a property while preserving the old value, confidence, and provenance;
- split one incorrectly bounded entity into multiple replacement entities while retaining the superseded entity.

Each revision increments the representation version and records its source and confidence.

## Fixture Proof

The repo adapter assigns stable `file:<path>` IDs and derives a file-count variable. The browser adapter keeps `page:active` and `field:<selector>` identities stable while URL and field values change across steps.

Executed from `vanta-ts/`:

```text
npm test -- --run src/schema
4 files, 18 tests passed

npm run typecheck
passed
```

The tests prove typed grounding, semantic diffs, provenance and confidence, stable identity across repo/browser steps, missing-variable revision, field supersession, entity-boundary revision, prior-state immutability, and confidence validation.

## Boundary

This representation is data, not executable code. Generated transition functions and goal predicates remain blocked behind the executable-model sandbox and executable-task-model roadmap cards.
