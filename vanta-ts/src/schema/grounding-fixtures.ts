import { z } from "zod";
import type { GroundingAdapter } from "./grounding.js";

const RepoObservationSchema = z.object({ paths: z.array(z.string()) });
export const repoGroundingAdapter: GroundingAdapter<z.infer<typeof RepoObservationSchema>> = {
  id: "repo-grounding-v1",
  observationSchema: RepoObservationSchema,
  ground: (observation, context) => ({
    entities: observation.paths.map((path) => context.entity(
      `file:${path}`,
      "file",
      { path: context.claim(path, `observation.paths:${path}`) },
      { affordances: [context.affordance("write", `file:${path}:write`)] },
    )),
    counters: { fileCount: context.claim(observation.paths.length, "observation.paths.length") },
  }),
};

const BrowserObservationSchema = z.object({ url: z.string(), fields: z.record(z.string(), z.string()) });
export const browserGroundingAdapter: GroundingAdapter<z.infer<typeof BrowserObservationSchema>> = {
  id: "browser-grounding-v1",
  observationSchema: BrowserObservationSchema,
  ground: (observation, context) => ({
    entities: [
      context.entity("page:active", "page", { url: context.claim(observation.url, "observation.url") }, {
        affordances: [context.affordance("navigate", "browser.navigate")],
      }),
      ...Object.entries(observation.fields).map(([selector, value]) => context.entity(
        `field:${selector}`,
        "field",
        {
          selector: context.claim(selector, `observation.fields:${selector}:selector`),
          value: context.claim(value, `observation.fields:${selector}:value`),
        },
        {
          relations: [context.relation("belongs-to", "page:active", `observation.fields:${selector}:page`)],
          affordances: [context.affordance("type", `field:${selector}:type`)],
        },
      )),
    ],
    counters: { fieldCount: context.claim(Object.keys(observation.fields).length, "observation.fields.count") },
  }),
};
