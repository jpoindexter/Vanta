import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";

const UsageSchema = z.object({ inputTokens: z.number().nonnegative(), outputTokens: z.number().nonnegative() });
const NodeSchema = z.object({
  id: z.string().min(1), treeId: z.string().min(1), parentId: z.string().min(1),
  parentTask: z.string().min(1), childPrompt: z.string().min(1), model: z.string().min(1),
  tools: z.array(z.string()), summary: z.string().min(1), rawSidechain: z.string().min(1),
  verification: z.enum(["pass", "fail", "blocked"]), stoppedReason: z.string().min(1),
  durationMs: z.number().nonnegative(), usage: UsageSchema.optional(), createdAt: z.string().min(1),
  estimatedCostUsd: z.number().nonnegative().nullable().optional(),
});

export type DelegationNode = z.infer<typeof NodeSchema>;
export type DelegationTree = { id: string; parentId: string; parentTask: string; nodes: DelegationNode[] };

export function delegationLedger(root: string): string {
  return join(root, ".vanta", "delegations", "nodes.jsonl");
}

export async function recordDelegationNode(root: string, node: DelegationNode): Promise<void> {
  const parsed = NodeSchema.parse(node);
  const path = delegationLedger(root);
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify(parsed)}\n`, { encoding: "utf8", mode: 0o600 });
}

export async function listDelegationTrees(root: string): Promise<DelegationTree[]> {
  const raw = await readFile(delegationLedger(root), "utf8").catch(() => "");
  const nodes = raw.split("\n").filter(Boolean).flatMap((line) => parseLine(line));
  const grouped = new Map<string, DelegationNode[]>();
  for (const node of nodes) grouped.set(node.treeId, [...(grouped.get(node.treeId) ?? []), node]);
  return [...grouped.entries()].map(([id, items]) => ({ id, parentId: items[0]!.parentId, parentTask: items[0]!.parentTask, nodes: items }))
    .sort((a, b) => (b.nodes.at(-1)?.createdAt ?? "").localeCompare(a.nodes.at(-1)?.createdAt ?? ""));
}

export function formatDelegationTree(tree: DelegationTree): string {
  const lines = [`Delegation ${tree.id} — ${tree.parentTask}`];
  for (const node of tree.nodes) {
    const usage = node.usage ? `${node.usage.inputTokens + node.usage.outputTokens} tokens` : "tokens unavailable";
    const cost = node.estimatedCostUsd == null ? "cost unavailable" : `$${node.estimatedCostUsd.toFixed(4)}`;
    lines.push(
      `\n${node.id} · ${node.verification} · ${node.model} · ${node.durationMs}ms · ${usage} · ${cost}`,
      `prompt: ${node.childPrompt}`,
      `tools: ${node.tools.join(", ") || "none"}`,
      `summary: ${node.summary}`,
      `raw: ${node.rawSidechain}`,
      `replay: vanta agents delegation replay ${node.id}`,
      `follow-up: vanta agents delegation follow-up ${node.id} "<instruction>"`,
    );
  }
  return lines.join("\n");
}

export async function findDelegationNode(root: string, id: string): Promise<DelegationNode | null> {
  return (await listDelegationTrees(root)).flatMap((tree) => tree.nodes).find((node) => node.id === id) ?? null;
}

function parseLine(line: string): DelegationNode[] {
  try { const parsed = NodeSchema.safeParse(JSON.parse(line)); return parsed.success ? [parsed.data] : []; }
  catch { return []; }
}
