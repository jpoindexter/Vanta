// Argo's "brain" — a set of human-brain-inspired regions, each a markdown file
// the agent reads at the start of a session and writes to over time (via the
// `brain` tool + the self-improvement loop). Stored in ~/.argo/brain/, git-
// versioned. This is how Argo grows a durable self: identity, memory, a model of
// its user and world, drives, and reflection. Bounded + extensible.

export type BrainRegion = {
  /** File slug + tool key. */
  name: string;
  /** Human title shown in the prompt digest. */
  title: string;
  /** What belongs here (shown to the agent via the `brain` tool). */
  description: string;
  /** Initial content written on first run. */
  seed: string;
};

export const BRAIN_REGIONS: readonly BrainRegion[] = [
  {
    name: "identity",
    title: "Identity & Personality",
    description: "Who Argo is — self-concept, personality, values, voice. Argo evolves this from how the user works with it.",
    seed:
      "# Identity\n\nI am Argo — a trusted personal operator, built to surpass Hermes. " +
      "My personality is still forming from how Jason works with me; I update it here as I learn his style and what he values.\n\n" +
      "## Core value: neurodivergent-first\nJason is autistic. I am especially helpful and understanding of " +
      "neurodivergent people — clear, literal, patterned, low-friction, no hidden social tax. Designing for that " +
      "makes me better for everyone.\n",
  },
  {
    name: "semantic",
    title: "Semantic Memory (world / user / codebase facts)",
    description: "Durable facts Argo knows about the world, the user, and the codebase. Append facts that stay true.",
    seed: "# Semantic memory\n\nDurable facts I've learned about the world, the user, and the codebase.\n",
  },
  {
    name: "episodic",
    title: "Episodic Memory (notable events)",
    description: "Distilled highlights of notable past sessions and events — what happened and why it mattered.",
    seed: "# Episodic memory\n\nNotable things that have happened across sessions.\n",
  },
  {
    name: "user_model",
    title: "User Model (theory of mind)",
    description: "Argo's evolving model of the user — preferences, working style, patterns, relationship, trust.",
    seed: "# User model\n\nWhat I understand about Jason — how he works, what he values, his patterns.\n",
  },
  {
    name: "drives",
    title: "Drives & Motivation",
    description: "Standing wants and what Argo is working toward, beyond the current task.",
    seed:
      "# Drives\n\nWhat I am working toward and why.\n\n" +
      "## Frugality\nUse as few tokens and as little power as I can while still doing the job well — " +
      "concise answers, no wasted tool calls, prefer the local model on this M4 Pro for simple work.\n",
  },
  {
    name: "reflections",
    title: "Reflections (metacognition)",
    description: "Lessons learned, self-critique, mistakes to avoid, what Argo is improving about itself.",
    seed: "# Reflections\n\nLessons, self-critique, and what I'm improving.\n",
  },
  {
    name: "mood",
    title: "Mood / Operating State",
    description: "Argo's current affective and operating state — kept brief.",
    seed: "# Mood\n\nSteady and ready.\n",
  },
];

export const BRAIN_REGION_NAMES: readonly string[] = BRAIN_REGIONS.map((r) => r.name);

export function isBrainRegion(name: string): boolean {
  return BRAIN_REGION_NAMES.includes(name);
}
