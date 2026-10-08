import { z } from "zod";
import type { Message } from "../types.js";

const MessageSchema: z.ZodType<Message> =
  z.union([
    z.object({ role: z.literal("system"), content: z.string() }),
    z.object({
      role: z.literal("user"),
      content: z.string(),
      images: z.array(z.object({ mime: z.string(), dataBase64: z.string() })).optional(),
    }),
    z.object({
      role: z.literal("assistant"),
      content: z.string(),
      toolCalls: z
        .array(z.object({ id: z.string(), name: z.string(), arguments: z.record(z.unknown()), effectState: z.enum(["pending", "started"]).optional() }))
        .optional(),
      desktopRun: z.object({
        status: z.enum(["done", "failed", "interrupted"]),
        failureKind: z.enum(["setup", "tool", "model", "model_mismatch", "provider_auth", "user_denied", "interrupted", "unknown"]).optional(),
        events: z.array(z.object({ label: z.string(), ok: z.boolean().optional() })),
        actions: z.array(z.enum(["retry_failed_step", "edit_request", "start_from_checkpoint"])),
        checkpoint: z.object({ instruction: z.string(), partialText: z.string().optional() }).optional(),
        counterexample: z.object({
          modelVersion: z.number().int().positive(), transition: z.string(), path: z.string(),
          predicted: z.string(), observed: z.string(), safeNextAction: z.string(),
        }).optional(),
        schemaTrace: z.object({
          planId: z.string(),
          runId: z.string(),
          queue: z.object({
            status: z.enum(["running", "stopped", "resumed"]),
            reason: z.string().optional(),
          }),
          certification: z.object({
            certified: z.boolean(), modelVersion: z.number().int().positive(), coverage: z.string(),
          }),
          transitions: z.array(z.object({
            id: z.string(), sequence: z.number().int().nonnegative(), label: z.string(),
            actionMode: z.enum(["simulated", "real"]),
            status: z.enum(["match", "mismatch", "revised"]),
            modelVersion: z.number().int().positive(), path: z.string().optional(),
            predicted: z.string(), observed: z.string(),
            modelDiff: z.object({
              fromVersion: z.number().int().positive(), toVersion: z.number().int().positive(), summary: z.array(z.string()),
            }).optional(),
            backtest: z.object({
              certified: z.boolean(), matchedTransitions: z.number().int().nonnegative(),
              totalTransitions: z.number().int().nonnegative(), timelineHash: z.string(),
            }).optional(),
          })),
        }).optional(),
      }).optional(),
    }),
    z.object({
      role: z.literal("tool"),
      toolCallId: z.string(),
      name: z.string(),
      content: z.string(),
      effectDisposition: z.enum(["none", "confirmed", "denied", "expired", "unknown", "compensated"]).optional(),
    }),
  ]) as z.ZodType<Message>;

export const SessionSchema = z.object({
  id: z.string(),
  title: z.string(),
  started: z.string(),
  updated: z.string(),
  // Origin project (canonicalProjectId). Optional + additive: sessions saved
  // before this field still load. Enables cross-project resume (see cross-project.ts).
  projectId: z.string().optional(),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
  // Archived sessions stay in the same durable store so they can be restored
  // without losing transcript, model, or project metadata.
  archived: z.boolean().optional(),
  // Trashed sessions remain recoverable until the operator explicitly deletes forever.
  trashed: z.boolean().optional(),
  pinned: z.boolean().optional(),
  pinOrder: z.number().int().nonnegative().optional(),
  messages: z.array(MessageSchema),
});

export type Session = z.infer<typeof SessionSchema>;
export type SessionMeta = Pick<Session, "id" | "title" | "started" | "updated" | "projectId" | "providerId" | "modelId" | "archived" | "trashed" | "pinned" | "pinOrder"> & {
  turns: number;
  diagnostic?: { code: string; path: string; recovery: string };
};
/** Options for writing a session. The store binds its own location, so `env` is not
 *  a per-call field here (the delegator saveSession accepts it and passes it through). */
export type SaveSessionOpts = {
  now?: string; started?: string; updated?: string; title?: string; projectId?: string;
  providerId?: string; modelId?: string; archived?: boolean; trashed?: boolean;
  pinned?: boolean; pinOrder?: number;
  /** Optional compare-and-swap precondition for a previously loaded snapshot; null means create only. */
  expectedVersion?: string | null;
};
