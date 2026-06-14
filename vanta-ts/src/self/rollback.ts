import type { Compartment } from "./compartments.js";
import type { RepairMarker } from "./detect.js";
import { lastKnownGood } from "./detect.js";
import { compartmentMap } from "./compartments.js";

// Slice 3 of the self-repair rock: propose-only rollback to last-known-good.
//
// NEVER shells out or executes git. Returns the exact command a human
// must run themselves (rule zero: no destructive git without human action).

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The paths tracked per compartment — matches compartmentMap() scope column. */
const COMPARTMENT_PATHS: Record<Compartment, string[]> = {
  brainstem: ["src/", "Cargo.toml", "Cargo.lock", "manifesto.md"],
  skeleton:  ["vanta-ts/src/factory/"],
  reflexes:  ["vanta-ts/src/agent.ts", "vanta-ts/src/agent/", "vanta-ts/src/prompt.ts"],
  memory:    ["vanta-ts/src/world/", "vanta-ts/src/money/", "vanta-ts/src/radar/", "vanta-ts/src/team/", "vanta-ts/src/brain/", ".vanta/"],
  limbs:     [], // everything else — no narrow path list
};

/** A rollback proposal. `command` is null when no marker is recorded. Pure, never executed. */
export type RollbackProposal = {
  compartment: Compartment;
  /** Last-known-good sha, or null when no marker exists. */
  sha: string | null;
  /** The exact git command a human should run, or null when no marker exists. */
  command: string | null;
  /** Human-readable reason (populated when command is null). */
  reason: string | null;
};

// ---------------------------------------------------------------------------
// Pure: proposeRollback
// ---------------------------------------------------------------------------

/**
 * Propose the git command to restore a compartment to its last-known-good sha.
 * Pure — does NOT shell out, does NOT run git. Returns {command:null, reason}
 * when no marker has been recorded for the compartment yet.
 *
 * The caller (human) is responsible for running the command.
 */
export function proposeRollback(
  compartment: Compartment,
  markers: RepairMarker[],
): RollbackProposal {
  const lkg = lastKnownGood(markers);
  const sha = lkg[compartment] ?? null;

  if (!sha) {
    return {
      compartment,
      sha: null,
      command: null,
      reason: `No last-known-good marker recorded for '${compartment}'. Run \`recordGood\` when the compartment is healthy to enable rollback proposals.`,
    };
  }

  const paths = COMPARTMENT_PATHS[compartment];
  const command = buildCommand(compartment, sha, paths);

  return { compartment, sha, command, reason: null };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildCommand(compartment: Compartment, sha: string, paths: string[]): string {
  if (compartment === "limbs") {
    // limbs has no narrow path list — recommend inspecting the sha first
    return `git log ${sha} -1 --oneline  # inspect, then: git checkout ${sha} -- <paths>`;
  }
  if (paths.length === 0) {
    return `git log ${sha} -1 --oneline`;
  }
  const pathsStr = paths.join(" ");
  return `git checkout ${sha} -- ${pathsStr}`;
}

// ---------------------------------------------------------------------------
// Formatter — pure, for /compartments rollback output
// ---------------------------------------------------------------------------

/** Format the proposal for human-readable display. */
export function formatRollbackProposal(proposal: RollbackProposal): string {
  const { compartment, sha, command, reason } = proposal;
  if (!sha || !command) {
    return [
      `Rollback proposal — ${compartment}`,
      "",
      `  No marker: ${reason ?? "unknown"}`,
      "",
      "  To enable rollback, record a healthy snapshot:",
      `  vanta compartments record ${compartment} <sha>`,
    ].join("\n");
  }

  return [
    `Rollback proposal — ${compartment}`,
    "",
    `  Last-known-good: ${sha}`,
    `  Command (run this yourself — not auto-executed):`,
    "",
    `    ${command}`,
    "",
    "  ⚠ This is a proposal only. Vanta will never run git for you.",
    "    Review the diff before executing.",
  ].join("\n");
}

/** Validate that a string is a known compartment name. Pure. */
export function isCompartment(value: string): value is Compartment {
  return compartmentMap().some((c) => c.compartment === value);
}
