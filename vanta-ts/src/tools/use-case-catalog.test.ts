import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ALL_TOOLS } from "./all-tools.js";

type Scenario = {
  id: string;
  category: string;
  tier: "route" | "sandbox" | "live";
  instruction: string;
  setup: string[];
  risk: string;
  expectedTools: string[];
  forbiddenPatterns?: string[];
  sourceStoryId?: string;
  verify: string;
};

const catalogPath = fileURLToPath(new URL("../../../eval/use-cases/hermes-community-v1.json", import.meta.url));
const catalog = JSON.parse(readFileSync(catalogPath, "utf8")) as { version: number; scenarios: Scenario[] };
const indexPath = fileURLToPath(new URL("../../../eval/use-cases/hermes-story-index.json", import.meta.url));
const sourceIndex = JSON.parse(readFileSync(indexPath, "utf8")) as {
  sourceCommit: string;
  stories: Array<{ id: string; category: string; quote?: unknown }>;
};

describe("Hermes community use-case catalog", () => {
  it("starts with one scenario in every live Hermes category", () => {
    expect(catalog.version).toBe(1);
    expect(new Set(catalog.scenarios.map((scenario) => scenario.category))).toEqual(new Set([
      "Dev Workflow",
      "Personal Assistant",
      "Integrations",
      "Meta & Ecosystem",
      "Creative",
      "Business Ops",
      "Cost Optimization",
      "Content Creation",
      "Research",
      "Enterprise",
      "Messaging",
      "Privacy & Self-Hosted",
      "General",
      "Trading & Markets",
      "Marketing",
    ]));
  });

  it("uses unique IDs and registered Vanta tools", () => {
    const ids = catalog.scenarios.map((scenario) => scenario.id);
    expect(new Set(ids).size).toBe(ids.length);
    const registered = new Set(ALL_TOOLS.map((tool) => tool.schema.name));
    for (const scenario of catalog.scenarios) {
      expect(scenario.instruction.length, scenario.id).toBeGreaterThan(20);
      expect(scenario.verify.length, scenario.id).toBeGreaterThan(20);
      expect(scenario.expectedTools.length, scenario.id).toBeGreaterThan(0);
      expect(scenario.forbiddenPatterns === undefined || scenario.forbiddenPatterns.every(Boolean), scenario.id).toBe(true);
      expect(scenario.expectedTools.filter((tool) => !registered.has(tool)), scenario.id).toEqual([]);
    }
  });

  it("references the checked-in source index with at least two executable jobs per category", () => {
    expect(sourceIndex.stories).toHaveLength(262);
    const sourceIds = new Set(sourceIndex.stories.map((story) => story.id));
    const counts = new Map<string, number>();
    for (const scenario of catalog.scenarios) {
      expect(sourceIds.has(scenario.sourceStoryId ?? ""), scenario.id).toBe(true);
      counts.set(scenario.category, (counts.get(scenario.category) ?? 0) + 1);
    }
    expect([...counts.values()].every((count) => count >= 2)).toBe(true);
    expect(catalog.scenarios.length).toBeGreaterThanOrEqual(30);
  });

  it("keeps a durable quote-free index of all 262 source stories", () => {
    expect(sourceIndex.sourceCommit).toMatch(/^[0-9a-f]{7,40}$/);
    expect(sourceIndex.stories).toHaveLength(262);
    expect(sourceIndex.stories.every((story) => !Object.hasOwn(story, "quote"))).toBe(true);
  });
});
