import {
  type ApplyChange,
  type Proposal,
  appendAppliedChange,
  getProposal,
  ratifyProposal,
  readProposals,
  rejectProposal,
  writeProposals,
} from "../cofounder/self-org.js";

// `vanta proposal list` / `ratify <id>` / `reject <id>`.
// Self-organization proposals the engine emits within governance bounds: the
// OWNER ratifies (applying the org change) or rejects (applying nothing). The
// engine never applies unilaterally. Handlers are pure over injected deps so the
// whole surface is unit-tested without real I/O. NOT wired into the cli table yet.

export type ProposalDeps = {
  readProposals: () => Promise<Proposal[]>;
  writeProposals: (list: Proposal[]) => Promise<void>;
  /** Apply a ratified proposal's org change. Called ONLY on ratify. */
  applyChange: ApplyChange;
  log: (line: string) => void;
};

const USAGE = [
  "usage:",
  "  vanta proposal list",
  "  vanta proposal ratify <id>",
  "  vanta proposal reject <id>",
].join("\n");

/** Render one proposal as a single text line. Pure. */
export function formatProposal(p: Proposal): string {
  const mark = p.status === "ratified" ? "✓" : p.status === "rejected" ? "✗" : "•";
  return `${mark} ${p.id} · ${p.kind} · dept:${p.departmentId} · ${p.status}\n    ${p.detail}`;
}

/** `proposal list` — every proposal in the queue, queue order. */
export async function handleProposalList(deps: ProposalDeps): Promise<number> {
  const list = await deps.readProposals();
  if (list.length === 0) {
    deps.log("no proposals — the engine emits them when a department is over-budget or an objective stalls");
    return 0;
  }
  for (const p of list) deps.log(formatProposal(p));
  return 0;
}

/** `proposal ratify <id>` — mark ratified AND apply the org change (owner-authorised). */
export async function handleProposalRatify(id: string, deps: ProposalDeps): Promise<number> {
  const list = await deps.readProposals();
  const result = await ratifyProposal(id, list, { applyChange: deps.applyChange });
  if (!result.ok) {
    deps.log(result.error);
    return 1;
  }
  await deps.writeProposals(result.value);
  deps.log(`ratified ${id} · org change applied`);
  return 0;
}

/** `proposal reject <id>` — mark rejected; the org is never touched. */
export async function handleProposalReject(id: string, deps: ProposalDeps): Promise<number> {
  const list = await deps.readProposals();
  const result = rejectProposal(id, list);
  if (!result.ok) {
    deps.log(result.error);
    return 1;
  }
  await deps.writeProposals(result.value);
  deps.log(`rejected ${id} · no change applied`);
  return 0;
}

/** Dispatch a parsed `vanta proposal <sub>` against injected deps. Pure orchestration. */
export async function handleProposal(rest: string[], deps: ProposalDeps): Promise<number> {
  const [sub, ...args] = rest;
  switch (sub) {
    case "list":
      return handleProposalList(deps);
    case "ratify":
    case "reject": {
      const id = args[0];
      if (id === undefined) {
        deps.log(`${sub} needs a proposal id\n${USAGE}`);
        return 1;
      }
      return sub === "ratify" ? handleProposalRatify(id, deps) : handleProposalReject(id, deps);
    }
    default:
      deps.log(USAGE);
      return sub ? 1 : 0;
  }
}

/** Build live deps: proposals in `~/.vanta/proposals.json`; ratify journals the change. */
function liveProposalDeps(): ProposalDeps {
  return {
    readProposals: () => readProposals(),
    writeProposals: (list) => writeProposals(list),
    // A ratified proposal IS the org change — record it to the durable, auditable
    // applied-change journal. The owner has already authorised it (ratify = gate).
    applyChange: (proposal) => appendAppliedChange(proposal),
    log: (line) => console.log(line),
  };
}

export async function runProposalCommand(rest: string[]): Promise<number> {
  return handleProposal(rest, liveProposalDeps());
}

export { getProposal };
