import { expect, it } from "vitest";
import { z } from "zod";
import { SettingsSchema } from "./settings/schema.js";
import { RuntimeObservationSchema } from "./runtime-controller/types.js";
import { RuntimeProfileV2Schema } from "./runtime-engine/profile-contract.js";
import { AgentNodeSchema } from "./workflow/node-schema.js";

it("rejects eight over-limit items before parsing any element", () => {
  let parsed = 0;
  const element = z.preprocess((value) => { parsed += 1; return value; }, z.string());
  const result = z.array(element).max(2).safeParse(Array(8).fill(1));
  expect(result.success).toBe(false);
  expect(parsed).toBe(0);
  if (!result.success) expect(result.error.issues.map((issue) => issue.code)).toEqual(["too_big"]);
});

it("also short-circuits an over-limit asynchronous array parse", async () => {
  let parsed = 0;
  const element = z.preprocess((value) => { parsed += 1; return value; }, z.string());
  const result = await z.array(element).max(2).safeParseAsync(Array(8).fill(1));
  expect(result.success).toBe(false);
  expect(parsed).toBe(0);
});

it("preserves empty outputs for all-optional runtime object defaults", () => {
  expect(RuntimeObservationSchema.shape.resources.parse(undefined)).toEqual({});
  expect(RuntimeProfileV2Schema.shape.performance.parse(undefined)).toEqual({});
});

it("keeps absent optional state/settings absent and defaults a present empty state", () => {
  expect(SettingsSchema.parse({})).toEqual({});
  const input = { id: "fixture", type: "agent", instruction: "Check defaults" };
  expect(AgentNodeSchema.parse(input)).not.toHaveProperty("state");
  expect(AgentNodeSchema.parse({ ...input, state: {} }).state).toEqual({ read: [], write: [] });
});
