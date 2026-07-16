import { z } from "zod";
import type { TaskTransitionRecord } from "./timeline.js";

const ConfidenceSchema = z.number().min(0).max(1);
const ProvenanceSchema = z.object({
  runId: z.string().min(1),
  transitionSequence: z.number().int().positive(),
  adapterId: z.string().min(1),
  source: z.string().min(1),
});
const SupersededValueSchema = z.object({
  value: z.unknown(),
  confidence: ConfidenceSchema,
  provenance: z.array(ProvenanceSchema).min(1),
});
const GroundedValueSchema = SupersededValueSchema.extend({ superseded: z.array(SupersededValueSchema) });
const RelationSchema = z.object({
  type: z.string().min(1),
  targetId: z.string().min(1),
  confidence: ConfidenceSchema,
  provenance: z.array(ProvenanceSchema).min(1),
});
const AffordanceSchema = z.object({
  action: z.string().min(1),
  confidence: ConfidenceSchema,
  provenance: z.array(ProvenanceSchema).min(1),
});
const GroundedEntitySchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  confidence: ConfidenceSchema,
  provenance: z.array(ProvenanceSchema).min(1),
  properties: z.record(z.string(), GroundedValueSchema),
  relations: z.array(RelationSchema),
  affordances: z.array(AffordanceSchema),
});
const RevisionSchema = z.object({
  version: z.number().int().positive(),
  kind: z.enum(["set-property", "split-entity"]),
  source: z.string().min(1),
  confidence: ConfidenceSchema,
});

export const GroundedStateSchema = z.object({
  schemaVersion: z.literal(1),
  representationVersion: z.number().int().positive(),
  source: z.object({ runId: z.string().min(1), transitionSequence: z.number().int().positive(), adapterId: z.string().min(1) }),
  entities: z.array(GroundedEntitySchema),
  counters: z.record(z.string(), GroundedValueSchema),
  supersededEntities: z.array(GroundedEntitySchema),
  revisions: z.array(RevisionSchema),
});

export type Provenance = z.infer<typeof ProvenanceSchema>;
export type GroundedValue = z.infer<typeof GroundedValueSchema>;
export type GroundedEntity = z.infer<typeof GroundedEntitySchema>;
export type GroundedState = z.infer<typeof GroundedStateSchema>;
export type GroundedDraft = { entities: GroundedEntity[]; counters: Record<string, GroundedValue> };
export type GroundingContext = {
  provenance(source: string): Provenance;
  claim(value: unknown, source: string, confidence?: number): GroundedValue;
  entity(id: string, type: string, properties: Record<string, GroundedValue>, options?: {
    confidence?: number;
    source?: string;
    relations?: GroundedEntity["relations"];
    affordances?: GroundedEntity["affordances"];
  }): GroundedEntity;
  relation(type: string, targetId: string, source: string, confidence?: number): GroundedEntity["relations"][number];
  affordance(action: string, source: string, confidence?: number): GroundedEntity["affordances"][number];
};
export type GroundingAdapter<Observation> = {
  id: string;
  observationSchema: z.ZodType<Observation>;
  ground(observation: Observation, context: GroundingContext, previous?: GroundedState): GroundedDraft;
};

function contextFor(record: TaskTransitionRecord, adapterId: string): GroundingContext {
  const provenance = (source: string): Provenance => ({
    runId: record.runId,
    transitionSequence: record.sequence,
    adapterId,
    source,
  });
  const claim = (value: unknown, source: string, confidence = 1): GroundedValue => ({
    value,
    confidence,
    provenance: [provenance(source)],
    superseded: [],
  });
  return {
    provenance,
    claim,
    entity: (id, type, properties, options = {}) => ({
      id,
      type,
      properties,
      confidence: options.confidence ?? 1,
      provenance: [provenance(options.source ?? `entity:${id}`)],
      relations: options.relations ?? [],
      affordances: options.affordances ?? [],
    }),
    relation: (type, targetId, source, confidence = 1) => ({ type, targetId, confidence, provenance: [provenance(source)] }),
    affordance: (action, source, confidence = 1) => ({ action, confidence, provenance: [provenance(source)] }),
  };
}

export function groundTransition<Observation>(
  record: TaskTransitionRecord,
  adapter: GroundingAdapter<Observation>,
  previous?: GroundedState,
): GroundedState {
  const observation = adapter.observationSchema.parse(record.observed);
  const draft = adapter.ground(observation, contextFor(record, adapter.id), previous);
  return GroundedStateSchema.parse({
    schemaVersion: 1,
    representationVersion: previous?.representationVersion ?? 1,
    source: { runId: record.runId, transitionSequence: record.sequence, adapterId: adapter.id },
    entities: draft.entities.slice().sort((a, b) => a.id.localeCompare(b.id)),
    counters: draft.counters,
    supersededEntities: previous?.supersededEntities ?? [],
    revisions: previous?.revisions ?? [],
  });
}

function semanticEntity(entity: GroundedEntity): unknown {
  return {
    type: entity.type,
    properties: Object.fromEntries(Object.entries(entity.properties).map(([key, value]) => [key, value.value])),
    relations: entity.relations.map(({ type, targetId }) => ({ type, targetId })),
    affordances: entity.affordances.map(({ action }) => action),
  };
}

export function diffGroundedStates(before: GroundedState, after: GroundedState): {
  addedEntities: string[];
  removedEntities: string[];
  changedEntities: string[];
  changedCounters: string[];
} {
  const prior = new Map(before.entities.map((entity) => [entity.id, entity]));
  const next = new Map(after.entities.map((entity) => [entity.id, entity]));
  const addedEntities = [...next.keys()].filter((id) => !prior.has(id)).sort();
  const removedEntities = [...prior.keys()].filter((id) => !next.has(id)).sort();
  const changedEntities = [...next.keys()].filter((id) => {
    const old = prior.get(id);
    return old && JSON.stringify(semanticEntity(old)) !== JSON.stringify(semanticEntity(next.get(id)!));
  }).sort();
  const counterKeys = new Set([...Object.keys(before.counters), ...Object.keys(after.counters)]);
  const changedCounters = [...counterKeys].filter((key) => before.counters[key]?.value !== after.counters[key]?.value).sort();
  return { addedEntities, removedEntities, changedEntities, changedCounters };
}

type SetPropertyRevision = {
  kind: "set-property";
  entityId: string;
  property: string;
  value: unknown;
  confidence: number;
  source: string;
};
type SplitEntityRevision = {
  kind: "split-entity";
  entityId: string;
  replacements: Array<{ id: string; type: string; properties: Record<string, unknown> }>;
  confidence: number;
  source: string;
};

export function reviseGroundedState(state: GroundedState, revision: SetPropertyRevision | SplitEntityRevision): GroundedState {
  const next = structuredClone(state);
  const provenance: Provenance = { ...state.source, source: revision.source };
  const version = state.representationVersion + 1;
  if (revision.kind === "set-property") {
    const entity = next.entities.find((candidate) => candidate.id === revision.entityId);
    if (!entity) throw new Error(`unknown grounded entity: ${revision.entityId}`);
    const previous = entity.properties[revision.property];
    entity.properties[revision.property] = {
      value: revision.value,
      confidence: revision.confidence,
      provenance: [provenance],
      superseded: previous ? [...previous.superseded, { value: previous.value, confidence: previous.confidence, provenance: previous.provenance }] : [],
    };
  } else {
    const index = next.entities.findIndex((candidate) => candidate.id === revision.entityId);
    if (index < 0) throw new Error(`unknown grounded entity: ${revision.entityId}`);
    const [superseded] = next.entities.splice(index, 1);
    if (superseded) next.supersededEntities.push(superseded);
    next.entities.push(...revision.replacements.map((replacement) => ({
      id: replacement.id,
      type: replacement.type,
      confidence: revision.confidence,
      provenance: [provenance],
      properties: Object.fromEntries(Object.entries(replacement.properties).map(([key, value]) => [key, {
        value, confidence: revision.confidence, provenance: [provenance], superseded: [],
      }])),
      relations: [],
      affordances: [],
    })));
    next.entities.sort((a, b) => a.id.localeCompare(b.id));
  }
  next.representationVersion = version;
  next.revisions.push({ version, kind: revision.kind, source: revision.source, confidence: revision.confidence });
  return GroundedStateSchema.parse(next);
}
