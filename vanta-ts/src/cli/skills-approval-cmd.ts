import {
  approveSkillMutation, formatSkillMutationDiff, listPendingSkillMutations, rejectSkillMutation,
  setSkillWriteApproval, skillWriteApprovalEnabled, type PendingSkillMutation,
} from "../skills/write-approval.js";

type Deps = { root: string; env: NodeJS.ProcessEnv; log: (line: string) => void; maxDiffChars?: number };

export async function runSkillsApprovalCommand(args: string[], deps: Deps): Promise<number | null> {
  const action = args[0];
  if (action === "pending") return pending(deps);
  if (action === "diff") return diff(args[1], deps);
  if (action === "reject") return reject(args[1], args.slice(2).join(" "), deps);
  if (action === "approval") return approval(args[1], deps);
  if (action === "approve" && args[1] && await hasPending(args[1], deps.env)) return approve(args[1], deps);
  return null;
}

async function pending(deps: Deps): Promise<number> {
  const records = await listPendingSkillMutations(deps.env);
  for (const item of records) deps.log(`${item.id}\t${item.mutation.action}\t${slugOf(item)}\t${item.sessionId ?? "unknown-session"}\t${item.reason}`);
  if (!records.length) deps.log("(no pending skill mutations)"); return 0;
}

async function diff(id: string | undefined, deps: Deps): Promise<number> {
  const record = id ? (await listPendingSkillMutations(deps.env)).find((item) => item.id === id) : undefined;
  if (!record) throw new Error(`pending skill mutation ${id ?? ""} not found`);
  deps.log(`${record.id}\t${record.mutation.action}\t${slugOf(record)}\n${formatSkillMutationDiff(record, deps.maxDiffChars, deps.env)}`); return 0;
}

async function approve(id: string, deps: Deps): Promise<number> {
  const record = await approveSkillMutation(id, { root: deps.root, env: deps.env }); deps.log(`approved ${record.id}\t${record.mutation.action}\t${slugOf(record)}`); return 0;
}

async function reject(id: string | undefined, note: string, deps: Deps): Promise<number> {
  if (!id) throw new Error("reject needs a proposal id");
  const record = await rejectSkillMutation(id, note || "operator rejected", { env: deps.env }); deps.log(`rejected ${record.id}\t${record.mutation.action}\t${slugOf(record)}`); return 0;
}

async function approval(value: string | undefined, deps: Deps): Promise<number> {
  if (!value) { deps.log(`skill write approval: ${await skillWriteApprovalEnabled(deps.root, deps.env) ? "on" : "off"}`); return 0; }
  if (!['on', 'off'].includes(value)) throw new Error("approval expects on or off");
  await setSkillWriteApproval(value === "on", deps.root, deps.env); deps.log(`skill write approval: ${value}`); return 0;
}

async function hasPending(id: string, env: NodeJS.ProcessEnv): Promise<boolean> { return (await listPendingSkillMutations(env)).some((item) => item.id === id); }
function slugOf(record: PendingSkillMutation): string { const mutation = record.mutation; return mutation.action === "create" || mutation.action === "edit" ? mutation.input.name : mutation.slug; }
