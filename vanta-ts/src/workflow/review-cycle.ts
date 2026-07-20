import type { GraphAgentOutcome } from "./run-state.js";
import { ReviewPacketSchema } from "./review-contract.js";
import type { WorkflowGraph, WorkflowNode } from "./schema.js";

type ReviewNode = Extract<WorkflowNode, { type: "review" }>;

export function validateReviewCycles(graph: WorkflowGraph): string[] {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  return graph.nodes.flatMap((node) => node.type === "review" ? reviewErrors(graph, node, nodes) : []);
}

export function validateReviewOutcome(
  node: ReviewNode,
  inputs: Record<string, unknown>,
  outcome: GraphAgentOutcome,
): GraphAgentOutcome {
  const packet = ReviewPacketSchema.parse(outcome.review);
  const current = inputs[node.artifactInput];
  if (!sameValue(current, packet.artifact)) throw new Error(`review ${node.id} references a stale artifact revision`);
  if (packet.findings.some((finding) => !sameValue(finding.affectedArtifact, packet.artifact))) {
    throw new Error(`review ${node.id} finding references a different artifact revision`);
  }
  return { ...outcome, review: packet, outputs: { ...outcome.outputs, [node.reviewOutput]: packet } };
}

function reviewErrors(graph: WorkflowGraph, review: ReviewNode, nodes: Map<string, WorkflowNode>): string[] {
  const maker = nodes.get(review.maker);
  const revision = graph.transitions.find((edge): edge is Extract<WorkflowGraph["transitions"][number], { type: "revision" }> => edge.type === "revision" && edge.from === review.id);
  const accepts = graph.transitions.some((edge) => edge.type === "branch" && edge.from === review.id && edge.when.node === review.id && edge.when.review === "accepted");
  return [
    ...makerErrors(review, maker),
    ...reviewPortErrors(review),
    ...revisionErrors(review, maker, revision),
    ...(accepts ? [] : [`review ${review.id} needs an acceptance edge`]),
  ];
}

function makerErrors(review: ReviewNode, maker: WorkflowNode | undefined): string[] {
  if (!maker) return [`review ${review.id} references missing maker ${review.maker}`];
  return maker.id === review.id || maker.type === "review" ? [`review ${review.id} must be isolated from its maker`] : [];
}

function reviewPortErrors(review: ReviewNode): string[] {
  const errors: string[] = [];
  if (review.io?.inputs[review.artifactInput] !== "artifact-ref") errors.push(`review ${review.id} needs artifact-ref input ${review.artifactInput}`);
  if (review.io?.outputs[review.reviewOutput] !== "json") errors.push(`review ${review.id} needs json output ${review.reviewOutput}`);
  if (review.bindings?.[review.artifactInput]?.node !== review.maker) errors.push(`review ${review.id} artifact input must come from maker ${review.maker}`);
  return errors;
}

function revisionErrors(review: ReviewNode, maker: WorkflowNode | undefined, revision: Extract<WorkflowGraph["transitions"][number], { type: "revision" }> | undefined): string[] {
  if (!revision) return [`review ${review.id} needs a revision edge`];
  const errors = feedbackPortErrors(review, maker, revision.feedback);
  if (revision.to !== review.maker) errors.push(`review ${review.id} revision edge must return to maker ${review.maker}`);
  if (revision.when.node !== review.id || revision.when.review !== "rejected") errors.push(`review ${review.id} revision edge must match its rejected result`);
  return errors;
}

function feedbackPortErrors(review: ReviewNode, maker: WorkflowNode | undefined, feedback: Record<string, string>): string[] {
  if (!maker) return [];
  return Object.entries(feedback).flatMap(([input, output]) => {
    const target = maker.io?.inputs[input];
    const source = review.io?.outputs[output];
    if (!target) return [`review ${review.id} feedback targets missing maker input ${input}`];
    if (!source) return [`review ${review.id} feedback references missing output ${output}`];
    return target === source ? [] : [`review ${review.id} feedback ${input} expects ${target}, got ${source}`];
  });
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left, sortedKeys(left)) === JSON.stringify(right, sortedKeys(right));
}

function sortedKeys(value: unknown): string[] | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? Object.keys(value).sort() : undefined;
}
