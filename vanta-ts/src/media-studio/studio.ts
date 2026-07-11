import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { resolveInScope } from "../scope.js";
import type { KanbanBoard } from "../kanban/schema.js";

const RelativePath = z.string().min(1).refine((path) => !path.startsWith("/") && !path.split(/[\\/]/).includes(".."), "path must stay inside the project");
const Scene = z.object({ title: z.string().min(1).max(120), duration: z.number().positive().max(30), background: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(), image: RelativePath.optional() })
  .refine((scene) => Boolean(scene.background) !== Boolean(scene.image), "scene needs exactly one of background or image");
export const MediaBriefSchema = z.object({ title: z.string().min(1).max(120), output: RelativePath.refine((path) => path.toLowerCase().endsWith(".mp4"), "output must be .mp4"), width: z.number().int().min(320).max(3840).default(1280), height: z.number().int().min(180).max(2160).default(720), fps: z.number().int().min(12).max(60).default(24), scenes: z.array(Scene).min(1).max(24) });
export type MediaBrief = z.infer<typeof MediaBriefSchema>;
export type MediaRunner = (tool: "ffmpeg" | "ffprobe", args: string[]) => Promise<string>;
type RenderOptions = { run?: MediaRunner; receiptDir: string; now?: Date };

export function productionStages() {
  return [
    { id: "script", role: "writer", evidence: "approved brief and scene list" },
    { id: "visual", role: "visual", evidence: "scoped source assets" },
    { id: "audio", role: "audio", evidence: "audio source or explicit silent track" },
    { id: "render", role: "renderer", evidence: "playable artifact and provider log" },
    { id: "review", role: "reviewer", evidence: "ffprobe and frame checks" },
  ];
}

export function mediaProductionBoard(brief: MediaBrief, now = new Date()): KanbanBoard {
  const at = now.toISOString();
  const dependencies: Record<string, string[]> = { script: [], visual: ["script"], audio: ["script"], render: ["visual", "audio"], review: ["render"] };
  return {
    id: `media-${at.replace(/[:.]/g, "-")}`,
    goal: brief.title,
    created: at,
    updated: at,
    swarmRuns: [],
    lanes: productionStages().map((stage) => ({ id: stage.id, title: stage.id[0]!.toUpperCase() + stage.id.slice(1), instruction: `${stage.evidence}. Media brief: ${brief.title}`, status: "todo", requiredSkills: [`media-${stage.id}`], dependencies: dependencies[stage.id] ?? [], evidence: [], wakePolicy: "manual", retries: 0, handoffs: [], updated: at })),
  };
}

export function previewMediaBrief(brief: MediaBrief) {
  const providers = ["ffmpeg-local", ...(brief.scenes.some((scene) => scene.image) ? ["project-image"] : [])];
  return { title: brief.title, output: brief.output, duration: brief.scenes.reduce((sum, scene) => sum + scene.duration, 0), dimensions: `${brief.width}x${brief.height}`, fps: brief.fps, providers, estimatedCostUsd: 0, scenes: brief.scenes.map((scene) => ({ title: scene.title, duration: scene.duration, source: scene.image ?? scene.background })) };
}

const liveRunner: MediaRunner = async (tool, args) => {
  const result = await promisify(execFile)(tool, args, { maxBuffer: 8 * 1024 * 1024, timeout: 120_000 });
  return `${result.stdout}\n${result.stderr}`;
};

function scoped(path: string, root: string): string {
  const result = resolveInScope(path, root);
  if (!result.ok) throw new Error(`media path outside project: ${path}`);
  return result.path;
}

function sceneArgs(root: string, brief: MediaBrief, index: number, output: string): string[] {
  const scene = brief.scenes[index]!;
  const common = ["-t", String(scene.duration), "-r", String(brief.fps), "-pix_fmt", "yuv420p", "-an", "-y", output];
  if (scene.background) {
    return ["-f", "lavfi", "-i", `color=c=${scene.background}:s=${brief.width}x${brief.height}:d=${scene.duration}`, ...common];
  }
  const image = scoped(scene.image!, root);
  const filter = `scale=${brief.width}:${brief.height}:force_original_aspect_ratio=decrease,pad=${brief.width}:${brief.height}:(ow-iw)/2:(oh-ih)/2`;
  return ["-loop", "1", "-i", image, "-vf", filter, ...common];
}

async function renderScenes(root: string, brief: MediaBrief, dir: string, run: MediaRunner): Promise<string[]> {
  const paths: string[] = [];
  for (let index = 0; index < brief.scenes.length; index += 1) {
    const path = join(dir, `scene-${String(index).padStart(3, "0")}.mp4`);
    await run("ffmpeg", sceneArgs(root, brief, index, path));
    paths.push(path);
  }
  return paths;
}

async function verify(output: string, brief: MediaBrief, run: MediaRunner) {
  const probeRaw = await run("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", output]);
  const probe = JSON.parse(probeRaw) as { streams?: Array<{ codec_type?: string; width?: number; height?: number }>; format?: { duration?: string } };
  const video = probe.streams?.find((stream) => stream.codec_type === "video");
  const duration = Number(probe.format?.duration ?? 0);
  const signal = await run("ffmpeg", ["-i", output, "-vf", "signalstats,metadata=print", "-frames:v", "1", "-f", "null", "-"]);
  const luminance = Number(/YAVG=([0-9.]+)/.exec(signal)?.[1] ?? 0);
  return [
    { name: "artifact-bytes", ok: (await stat(output)).size > 0 },
    { name: "video-stream", ok: Boolean(video) },
    { name: "dimensions", ok: video?.width === brief.width && video?.height === brief.height },
    { name: "duration", ok: Math.abs(duration - previewMediaBrief(brief).duration) <= 0.25 },
    { name: "nonblank-frame", ok: luminance > 1 && luminance < 254 },
  ];
}

export async function renderMediaBrief(root: string, brief: MediaBrief, options: RenderOptions) {
  const run = options.run ?? liveRunner;
  const output = scoped(brief.output, root);
  const dir = join(root, ".vanta", "media", `render-${randomUUID()}`);
  await mkdir(dir, { recursive: true });
  await mkdir(dirname(output), { recursive: true });
  try {
    const scenes = await renderScenes(root, brief, dir, run);
    const concat = join(dir, "concat.txt");
    await writeFile(concat, scenes.map((path) => `file '${path.replaceAll("'", "'\\''")}'`).join("\n"));
    await run("ffmpeg", ["-f", "concat", "-safe", "0", "-i", concat, "-c", "copy", "-movflags", "+faststart", "-y", output]);
    const checks = await verify(output, brief, run);
    const verified = checks.every((check) => check.ok);
    const receipt = { title: brief.title, output, at: (options.now ?? new Date()).toISOString(), provider: "ffmpeg-local", estimatedCostUsd: 0, sourceAssets: brief.scenes.flatMap((scene) => scene.image ? [scene.image] : []), scenes: previewMediaBrief(brief).scenes, checks, verified };
    await mkdir(options.receiptDir, { recursive: true });
    const receiptPath = join(options.receiptDir, `${randomUUID()}.json`);
    await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
    if (!verified) throw new Error(`media verification failed: ${checks.filter((check) => !check.ok).map((check) => check.name).join(", ")}`);
    return { output, receiptPath, checks, verified };
  } finally { await rm(dir, { recursive: true, force: true }); }
}
