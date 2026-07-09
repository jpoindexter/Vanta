export type ComponentEdit = {
  id: string;
  component: string;
  predictedFix: string[];
  verification: string[];
  isolatedLift: number;
};

export type ComponentInteraction = {
  components: [string, string];
  reason: string;
  penalty?: number;
};

export type InteractionPlan = {
  edits: ComponentEdit[];
  predictedFix: string[];
  verification: string[];
  isolatedLiftSum: number;
  expectedCombinedLift: number;
  redundantChecksRemoved: number;
  interactions: ComponentInteraction[];
};

const DEFAULT_INTERACTION_PENALTY = 0.5;

export function composeInteractionAware(edits: ComponentEdit[], interactions: ComponentInteraction[] = []): InteractionPlan {
  const relevant = relevantInteractions(edits, interactions);
  const verification = unique(edits.flatMap((edit) => edit.verification));
  const isolatedLiftSum = round(edits.reduce((sum, edit) => sum + edit.isolatedLift, 0));
  const penalty = relevant.reduce((sum, interaction) => sum + (interaction.penalty ?? DEFAULT_INTERACTION_PENALTY), 0);
  return {
    edits,
    predictedFix: unique(edits.flatMap((edit) => edit.predictedFix)),
    verification,
    isolatedLiftSum,
    expectedCombinedLift: Math.max(0, round(isolatedLiftSum - penalty)),
    redundantChecksRemoved: edits.flatMap((edit) => edit.verification).length - verification.length,
    interactions: relevant,
  };
}

export function formatInteractionPlan(plan: InteractionPlan): string {
  return [
    `interaction-aware: ${plan.edits.length} edit(s), ${plan.redundantChecksRemoved} redundant check(s) removed`,
    `predicted lift: ${plan.expectedCombinedLift}pp / ${plan.isolatedLiftSum}pp isolated`,
    `verification: ${plan.verification.join(", ") || "(none)"}`,
    `interactions: ${plan.interactions.map(formatInteraction).join("; ") || "(none)"}`,
  ].join(" · ");
}

function relevantInteractions(edits: ComponentEdit[], interactions: ComponentInteraction[]): ComponentInteraction[] {
  const touched = new Set(edits.map((edit) => edit.component));
  return interactions.filter((interaction) => interaction.components.every((component) => touched.has(component)));
}

function unique(items: string[]): string[] {
  return [...new Set(items)];
}

function formatInteraction(interaction: ComponentInteraction): string {
  return `${interaction.components.join("+")}: ${interaction.reason}`;
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}
