// COFOUNDER-ENFORCED-OUTCOME — a task is not done without its declared artifact.
// THEFT's central rule: every task declares an expected output type. A task
// cannot read as complete without a matching artifact OR an explicit
// "no artifact because…" reason that persists on the task.
//
// PURE: no I/O, no concrete artifact store. The artifact-existence check is an
// INJECTED predicate so this stays decoupled from cofounder/work-products.ts
// and any concrete store.

/**
 * The done-contract attached to a task. `expectedOutput` is the declared
 * artifact type that must exist before the task may close. `satisfiedBy`
 * records which artifact closed it; `noArtifactReason` records an explicit
 * forced-close justification when no artifact exists.
 */
export type OutcomeContract = {
  expectedOutput: string;
  satisfiedBy?: string;
  noArtifactReason?: string;
};

/** Predicate deciding whether an artifact of the expected type exists. */
export type HasArtifact = (expectedOutput: string) => boolean;

export type ContractResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

/** Attach a fresh outcome contract to a task draft. Pure. */
export function requireOutcome<T extends object>(
  taskDraft: T,
  expectedOutput: string,
): ContractResult<T & { outcome: OutcomeContract }> {
  const trimmed = expectedOutput.trim();
  if (!trimmed) {
    return { ok: false, error: "expectedOutput must be a non-empty type name" };
  }
  return { ok: true, value: { ...taskDraft, outcome: { expectedOutput: trimmed } } };
}

/**
 * The contract gate. A task with this contract may close ONLY when an artifact
 * of the expected type exists OR an explicit no-artifact reason is set. Pure.
 */
export function canCloseTask(contract: OutcomeContract, hasArtifact: HasArtifact): boolean {
  if (hasNoArtifactReason(contract)) return true;
  return hasArtifact(contract.expectedOutput);
}

/**
 * Force-close with an explicit reason. The reason persists on the returned
 * contract so a forced close always carries its justification. Pure.
 */
export function closeWithReason(
  contract: OutcomeContract,
  reason: string,
): ContractResult<OutcomeContract> {
  const trimmed = reason.trim();
  if (!trimmed) {
    return { ok: false, error: "a forced close requires a non-empty no-artifact reason" };
  }
  return { ok: true, value: { ...contract, noArtifactReason: trimmed } };
}

/**
 * Record the artifact that satisfied the contract. Pure. The artifact's
 * existence is still decided by the injected predicate at close time; this only
 * records which artifact closed it for audit.
 */
export function recordArtifact(
  contract: OutcomeContract,
  satisfiedBy: string,
): ContractResult<OutcomeContract> {
  const trimmed = satisfiedBy.trim();
  if (!trimmed) {
    return { ok: false, error: "satisfiedBy must name the artifact that satisfied the contract" };
  }
  return { ok: true, value: { ...contract, satisfiedBy: trimmed } };
}

function hasNoArtifactReason(contract: OutcomeContract): boolean {
  return typeof contract.noArtifactReason === "string" && contract.noArtifactReason.trim().length > 0;
}
