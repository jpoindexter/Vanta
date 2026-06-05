// BRAIN-NEURO: Full 12-axis cognitive architecture extending BRAIN-5D.
// Each memory node has 12 dimensions modelling human cognitive neuroscience.

export type MemoryNodeType = "fact" | "skill" | "preference" | "pattern" | "insight" | "plan" | "emotion";
export type SourceType = "observation" | "inference" | "self-report" | "external" | "crystallized";
export type CrystalStatus = "raw" | "compressed" | "crystallized";

export type NeuroMemoryNode = {
  // Dimension 1: semantic type
  nodeType: MemoryNodeType;
  // Dimension 2: temporal (ISO strings)
  createdAt: string;
  updatedAt: string;
  accessedAt?: string;
  // Dimension 3: epistemic uncertainty (0=certain, 1=pure speculation)
  confidence: number;
  // Dimension 4: consolidation strength (0=ephemeral, 1=permanent)
  strength: number;
  // Dimension 5: attention weight (0=background, 1=foreground)
  salience: number;
  // Dimension 6: emotional valence (-1=negative, 0=neutral, +1=positive)
  valence: number;
  // Dimension 7: retrieval count — reinforced by use
  retrievalCount: number;
  // Dimension 8: source provenance
  sourceType: SourceType;
  sourceRef?: string;
  // Dimension 9: contradiction flags (IDs of contradicting nodes)
  contradicts: string[];
  // Dimension 10: reinforcement chain (IDs of nodes that strengthen this one)
  reinforcedBy: string[];
  // Dimension 11: crystallization status
  crystalStatus: CrystalStatus;
  // Dimension 12: decay horizon (ISO date; null = never forgets)
  forgetAfter?: string;
  // Core content
  id: string;
  region: string;
  content: string;
  relatedIds: string[];
};

/**
 * Score a neuro node using the full 12-axis model.
 * Combines strength, recency, salience, confidence, and retrieval frequency.
 */
export function neuroScore(node: NeuroMemoryNode, now = new Date()): number {
  const ageMs = now.getTime() - new Date(node.updatedAt).getTime();
  const ageDays = ageMs / 86_400_000;
  const recency = Math.exp(-ageDays / 14); // 14-day half-life (shorter than 5D)
  const retrieval = Math.log1p(node.retrievalCount) / 10; // log-scaled frequency bonus
  return node.strength * recency * node.confidence * (1 + node.salience * 0.5 + retrieval);
}

/**
 * Determine if contradicting nodes reduce this node's effective confidence.
 * Contradictions apply a penalty proportional to the count.
 */
export function adjustedConfidence(node: NeuroMemoryNode): number {
  const penalty = Math.min(0.5, node.contradicts.length * 0.15);
  return Math.max(0, node.confidence - penalty);
}

/**
 * Crystallization: when a node has been retrieved many times, it "crystallizes"
 * from raw → compressed → crystallized, indicating a stable long-term memory.
 */
export function shouldCrystallize(node: NeuroMemoryNode): CrystalStatus {
  if (node.retrievalCount >= 10) return "crystallized";
  if (node.retrievalCount >= 3) return "compressed";
  return "raw";
}

/** Format a neuro node for prompt injection (compact). */
export function formatNeuroNode(node: NeuroMemoryNode): string {
  const conf = adjustedConfidence(node);
  const tags = [
    `str:${node.strength.toFixed(2)}`,
    `conf:${conf.toFixed(2)}`,
    node.crystalStatus !== "raw" ? node.crystalStatus : null,
    node.contradicts.length > 0 ? "⚡conflict" : null,
  ].filter(Boolean).join(" ");
  return `[${node.region}|${tags}] ${node.content.slice(0, 150)}`;
}
