import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { z } from "zod";
import type { ImageAttachment } from "../types.js";
import { desktopTurnQueuePath } from "./turn-queue.js";

// Images attached while a turn runs ride with the queued instruction. They are too large for the queue
// document (every queue change rewrites it), so each queued turn keeps its images in its own file next to it.
// A screen-capture receipt is not kept: a queued image may be sent long after the capture's freshness window.

const SAFE_ID = /^[A-Za-z0-9-]{1,64}$/;
const StoredSchema = z.array(z.object({ mime: z.string(), dataBase64: z.string() }));

function imagesPath(root: string, id: string, env: NodeJS.ProcessEnv): string | null {
  if (!SAFE_ID.test(id)) return null;
  return join(dirname(desktopTurnQueuePath(root, env)), "images", `${id}.json`);
}

export async function saveQueuedImages(root: string, id: string, images: ImageAttachment[], env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const path = imagesPath(root, id, env);
  if (!path || images.length === 0) return;
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(images.map(({ mime, dataBase64 }) => ({ mime, dataBase64 }))), { encoding: "utf8", mode: 0o600 });
  await rename(temporary, path);
}

/** The images a queued turn was given, or none when the file is absent or unreadable. */
export async function loadQueuedImages(root: string, id: string, env: NodeJS.ProcessEnv = process.env): Promise<ImageAttachment[]> {
  const path = imagesPath(root, id, env);
  if (!path) return [];
  try {
    const parsed = StoredSchema.safeParse(JSON.parse(await readFile(path, "utf8")));
    return parsed.success ? parsed.data : [];
  } catch { return []; }
}

export async function deleteQueuedImages(root: string, id: string, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const path = imagesPath(root, id, env);
  if (path) await rm(path, { force: true });
}
