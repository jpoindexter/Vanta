import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { z } from "zod";

const ScalarSchema = z.union([z.string(), z.number().finite(), z.boolean(), z.null()]);
const ColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/).optional();
const BaseSchema = z.object({
  version: z.literal(1),
  id: z.string().min(1).max(80),
  title: z.string().min(1).max(120),
  subtitle: z.string().max(240).optional(),
  createdAt: z.string().datetime(),
  sessionId: z.string().min(1).max(120).optional(),
  source: z.object({ tool: z.literal("render_canvas") }),
});

const ChartSchema = BaseSchema.extend({
  kind: z.literal("chart"),
  chart: z.object({
    type: z.enum(["bar", "line"]),
    categories: z.array(z.string().max(40)).min(1).max(24),
    series: z.array(z.object({
      name: z.string().min(1).max(60),
      color: ColorSchema,
      values: z.array(z.number().finite().nonnegative()).min(1).max(24),
    })).min(1).max(6),
    xLabel: z.string().max(60).optional(),
    yLabel: z.string().max(60).optional(),
  }),
}).superRefine((artifact, ctx) => {
  for (const [index, series] of artifact.chart.series.entries()) {
    if (series.values.length !== artifact.chart.categories.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["chart", "series", index, "values"], message: "must match categories length" });
    }
  }
});

const TableSchema = BaseSchema.extend({
  kind: z.literal("table"),
  table: z.object({
    columns: z.array(z.object({
      key: z.string().min(1).max(40),
      label: z.string().min(1).max(60),
      format: z.enum(["text", "number", "currency", "percent"]).optional(),
    })).min(1).max(10),
    rows: z.array(z.record(z.string(), ScalarSchema)).max(100),
  }),
});

const BoardItemSchema = z.object({
  title: z.string().min(1).max(100),
  detail: z.string().max(400).optional(),
  status: z.string().max(40).optional(),
  metric: z.string().max(40).optional(),
});
const BoardSchema = BaseSchema.extend({
  kind: z.literal("board"),
  board: z.object({
    columns: z.array(z.object({
      title: z.string().min(1).max(60),
      items: z.array(BoardItemSchema).max(20),
    })).min(1).max(6),
  }),
});

export const CanvasArtifactSchema = z.union([ChartSchema, TableSchema, BoardSchema]);
export type CanvasArtifact = z.infer<typeof CanvasArtifactSchema>;

export const CANVAS_ARTIFACT_PATH = join(".vanta", "canvas.json");

export function canvasArtifactPath(root: string): string {
  return join(root, CANVAS_ARTIFACT_PATH);
}

export async function writeCanvasArtifact(root: string, artifact: CanvasArtifact): Promise<void> {
  const target = canvasArtifactPath(root);
  const temp = `${target}.${process.pid}.${randomUUID()}.tmp`;
  await mkdir(dirname(target), { recursive: true });
  await writeFile(temp, `${JSON.stringify(artifact, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temp, target);
}

export async function readCanvasArtifact(root: string): Promise<CanvasArtifact | null> {
  try {
    return CanvasArtifactSchema.parse(JSON.parse(await readFile(canvasArtifactPath(root), "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
