// Zod schemas for every JSON file the parity harness reads or writes.
import fs from "node:fs";
import { z } from "zod";

const Px = z.union([z.number(), z.string().regex(/^\d+(\.\d+)?%$/)]);

const LOCATOR_KINDS = ["css", "testId", "role", "text", "label", "placeholder"];
const locatorShape = {
  css: z.string().optional(),
  testId: z.string().optional(),
  role: z.string().optional(),
  name: z.string().optional(),
  text: z.string().optional(),
  label: z.string().optional(),
  placeholder: z.string().optional(),
  exact: z.boolean().optional(),
  within: z.string().optional(),
  nth: z.number().int().optional(),
};
const needsLocator = (l) => LOCATOR_KINDS.some((k) => l[k] !== undefined);
const LOCATOR_MSG = `locator needs one of ${LOCATOR_KINDS.join(", ")}`;

export const LocatorSpec = z.object(locatorShape).strict().refine(needsLocator, { message: LOCATOR_MSG });

export const Tolerance = z
  .object({ x: Px, y: Px, w: Px, h: Px, fontSize: Px, radius: Px, border: Px })
  .partial()
  .strict();

const entryOptions = {
  textMode: z.enum(["all", "own", "none"]).optional(),
  hug: z.boolean().optional(),
  flow: z.boolean().optional(),
  hoverOnly: z.boolean().optional(),
  tol: Tolerance.optional(),
  note: z.string().optional(),
};

/** A role key maps to a locator plus comparison hints, or to the literal string UNMAPPED. */
export const KeyEntry = z.union([
  z.literal("UNMAPPED"),
  z.object({ ...locatorShape, ...entryOptions }).strict().refine(needsLocator, { message: LOCATOR_MSG }),
]);

export const Step = z.union([
  z.object({ click: LocatorSpec }).strict(),
  z.object({ fill: LocatorSpec, value: z.string() }).strict(),
  z.object({ press: z.string(), on: LocatorSpec.optional() }).strict(),
  z.object({ hover: LocatorSpec }).strict(),
  z.object({ goto: z.string() }).strict(),
  z.object({ reload: z.literal(true) }).strict(),
  z.object({ storage: z.object({ key: z.string(), value: z.string() }) }).strict(),
  z.object({ waitFor: LocatorSpec, timeout: z.number().optional() }).strict(),
  z.object({ wait: z.number() }).strict(),
]);

export const Driver = z.union([z.literal("UNMAPPED"), z.array(Step)]);

export const SelectorMap = z
  .object({
    version: z.literal(1),
    target: z.string(),
    description: z.string().optional(),
    viewport: z.union([
      z.object({ mode: z.literal("fixed"), w: z.number(), h: z.number() }).strict(),
      z.object({ mode: z.literal("frame") }).strict(),
    ]),
    prepare: z.object({ css: z.string().optional(), initScript: z.string().optional() }).strict().default({}),
    frame: LocatorSpec.optional(),
    copyRoot: LocatorSpec.optional(),
    drivers: z.record(z.string(), Driver),
    keys: z.record(z.string(), KeyEntry),
  })
  .strict();

const Border = z.tuple([z.number(), z.number(), z.number(), z.number()]);

export const SpecElement = z
  .object({
    visible: z.boolean(),
    display: z.string(),
    text: z.string().optional(),
    placeholder: z.string().optional(),
    x: z.number().optional(),
    y: z.number().optional(),
    w: z.number().optional(),
    h: z.number().optional(),
    fontSize: z.number().optional(),
    fontWeight: z.number().optional(),
    radius: z.number().optional(),
    border: Border.optional(),
    filled: z.boolean().optional(),
    color: z.string().optional(),
    bg: z.string().optional(),
    aria: z.record(z.string(), z.string()).optional(),
  })
  .strict();

export const SpecState = z
  .object({
    w: z.number(),
    theme: z.enum(["light", "dark"]),
    facets: z.array(z.string()),
    frame: z.object({ w: z.number(), h: z.number() }),
    absent: z.array(z.string()),
    lists: z.record(z.string(), z.number()),
    elements: z.record(z.string(), SpecElement),
  })
  .strict();

export const Spec = z
  .object({
    version: z.literal(1),
    source: z.object({ file: z.string(), sha256: z.string() }),
    frameHeight: z.number(),
    hoverOnlyKeys: z.array(z.string()),
    keyOptions: z.record(z.string(), z.object({ hug: z.boolean().optional(), flow: z.boolean().optional(), tol: Tolerance.optional() })),
    states: z.record(z.string(), SpecState),
  })
  .strict();

export const CopyInventory = z
  .object({
    version: z.literal(1),
    states: z.record(z.string(), z.object({ strings: z.array(z.string()), hoverOnly: z.array(z.string()) }).strict()),
  })
  .strict();

export const Deviation = z
  .object({
    id: z.string(),
    reason: z.string(),
    props: z.array(z.string()).min(1),
    keys: z.array(z.string()).optional(),
    states: z.array(z.string()).optional(),
    transform: z.enum(["stripGlyphs", "ignore"]),
  })
  .strict();

export const AllowedDeviations = z.object({ version: z.literal(1), deviations: z.array(Deviation) }).strict();

/** Read a JSON file and validate it; the error names the file and the failing path. */
export function loadJson(file, schema) {
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new Error(`${file} failed validation at ${first.path.join(".") || "(root)"}: ${first.message}`);
  }
  return parsed.data;
}
