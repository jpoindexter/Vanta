import { randomUUID } from "node:crypto";
import { z } from "zod";
import { CanvasArtifactSchema, CANVAS_ARTIFACT_PATH, writeCanvasArtifact } from "../canvas/artifact.js";
import type { Tool } from "./types.js";

const ChartArgs = z.object({
  kind: z.literal("chart"), title: z.string().min(1).max(120), subtitle: z.string().max(240).optional(),
  chart: z.object({
    type: z.enum(["bar", "line"]), categories: z.array(z.string().max(40)).min(1).max(24),
    series: z.array(z.object({ name: z.string().min(1).max(60), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(), values: z.array(z.number().finite().nonnegative()).min(1).max(24) })).min(1).max(6),
    xLabel: z.string().max(60).optional(), yLabel: z.string().max(60).optional(),
  }),
});
const TableArgs = z.object({
  kind: z.literal("table"), title: z.string().min(1).max(120), subtitle: z.string().max(240).optional(),
  table: z.object({
    columns: z.array(z.object({ key: z.string().min(1).max(40), label: z.string().min(1).max(60), format: z.enum(["text", "number", "currency", "percent"]).optional() })).min(1).max(10),
    rows: z.array(z.record(z.string(), z.union([z.string(), z.number().finite(), z.boolean(), z.null()]))).max(100),
  }),
});
const BoardArgs = z.object({
  kind: z.literal("board"), title: z.string().min(1).max(120), subtitle: z.string().max(240).optional(),
  board: z.object({ columns: z.array(z.object({
    title: z.string().min(1).max(60),
    items: z.array(z.object({ title: z.string().min(1).max(100), detail: z.string().max(400).optional(), status: z.string().max(40).optional(), metric: z.string().max(40).optional() })).max(20),
  })).min(1).max(6) }),
});
const Args = z.discriminatedUnion("kind", [ChartArgs, TableArgs, BoardArgs]);

export const renderCanvasTool: Tool = {
  schema: {
    name: "render_canvas",
    description: "Render a bounded interactive chart, table, or board in the Vanta Desktop Canvas. Replaces the current canvas artifact.",
    parameters: {
      type: "object", required: ["kind", "title"],
      properties: {
        kind: { type: "string", enum: ["chart", "table", "board"] },
        title: { type: "string", description: "Visible artifact title, at most 120 characters." },
        subtitle: { type: "string", description: "Optional visible context, at most 240 characters." },
        chart: {
          type: "object", required: ["type", "categories", "series"],
          properties: {
            type: { type: "string", enum: ["bar", "line"] },
            categories: { type: "array", items: { type: "string" }, maxItems: 24 },
            series: { type: "array", maxItems: 6, items: { type: "object", required: ["name", "values"], properties: { name: { type: "string" }, color: { type: "string", description: "Optional six-digit hex color." }, values: { type: "array", items: { type: "number", minimum: 0 }, maxItems: 24 } } } },
            xLabel: { type: "string" }, yLabel: { type: "string" },
          },
        },
        table: {
          type: "object", required: ["columns", "rows"],
          properties: {
            columns: { type: "array", maxItems: 10, items: { type: "object", required: ["key", "label"], properties: { key: { type: "string" }, label: { type: "string" }, format: { type: "string", enum: ["text", "number", "currency", "percent"] } } } },
            rows: { type: "array", maxItems: 100, items: { type: "object", description: "Object keyed by column key; values must be string, number, boolean, or null." } },
          },
        },
        board: {
          type: "object", required: ["columns"],
          properties: {
            columns: { type: "array", maxItems: 6, items: { type: "object", required: ["title", "items"], properties: { title: { type: "string" }, items: { type: "array", maxItems: 20, items: { type: "object", required: ["title"], properties: { title: { type: "string" }, detail: { type: "string" }, status: { type: "string" }, metric: { type: "string" } } } } } } },
          },
        },
      },
    },
  },
  describeForSafety: (args) => `render canvas ${String(args.kind ?? "artifact")} ${JSON.stringify(String(args.title ?? ""))}`,
  async execute(raw, ctx) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) return { ok: false, output: `invalid canvas artifact: ${parsed.error.issues[0]?.message ?? "invalid input"}` };
    const artifact = CanvasArtifactSchema.safeParse({
      ...parsed.data, version: 1, id: randomUUID(), createdAt: new Date().toISOString(),
      sessionId: ctx.sessionId, source: { tool: "render_canvas" },
    });
    if (!artifact.success) return { ok: false, output: `invalid canvas artifact: ${artifact.error.issues[0]?.message ?? "invalid input"}` };
    try {
      await writeCanvasArtifact(ctx.root, artifact.data);
      return { ok: true, output: `rendered ${artifact.data.kind} canvas "${artifact.data.title}" · ${CANVAS_ARTIFACT_PATH} · ${artifact.data.id}` };
    } catch (error) {
      return { ok: false, output: `could not render canvas: ${(error as Error).message.split("\n")[0]}` };
    }
  },
};
