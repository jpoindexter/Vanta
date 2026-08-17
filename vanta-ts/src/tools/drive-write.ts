import { z } from "zod";
import type { Tool, ToolResult } from "./types.js";
import { googleFetch, buildUrl } from "../google/client.js";

// Drive write tools (create/update). Extracted from drive.ts (size gate).

const DEFAULT_MIME = "text/plain";
const BOUNDARY = "argo_drive_boundary_7f3a9c1e";
const UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";
const FILES_URL = "https://www.googleapis.com/drive/v3/files";

const CreateArgs = z.object({
  name: z.string().min(1),
  content: z.string(),
  mimeType: z.string().min(1).optional(),
});
const UpdateArgs = z.object({
  id: z.string().min(1),
  version: z.string().regex(/^\d+$/),
  content: z.string(),
  mimeType: z.string().min(1).optional(),
});

const UploadResponse = z.object({ id: z.string(), version: z.string().optional() }).passthrough();
const MetadataResponse = z.object({ id: z.string(), version: z.string() }).passthrough();
const GeneratedIdsResponse = z.object({ ids: z.array(z.string().min(1)).min(1) }).passthrough();
type CreateInput = z.infer<typeof CreateArgs>;
type UpdateInput = z.infer<typeof UpdateArgs>;

async function generateFileId(): Promise<string | null> {
  const response = await googleFetch(buildUrl(`${FILES_URL}/generateIds`, {
    count: 1,
    space: "drive",
    type: "files",
  }), { method: "GET" });
  if (!response.ok) return null;
  const parsed = GeneratedIdsResponse.safeParse(await response.json());
  return parsed.success ? parsed.data.ids[0] ?? null : null;
}

async function readDriveContent(id: string): Promise<string | null> {
  const response = await googleFetch(buildUrl(`${FILES_URL}/${encodeURIComponent(id)}`, { alt: "media" }), { method: "GET" });
  return response.ok ? response.text() : null;
}

async function readDriveVersion(id: string): Promise<string | null> {
  const response = await googleFetch(buildUrl(`${FILES_URL}/${encodeURIComponent(id)}`, { fields: "id,version" }), { method: "GET" });
  if (!response.ok) return null;
  const parsed = MetadataResponse.safeParse(await response.json());
  return parsed.success && parsed.data.id === id ? parsed.data.version : null;
}

function versionAtLeast(actual: string | null, acknowledged: string | undefined): boolean {
  if (acknowledged === undefined) return true;
  if (actual === null) return false;
  try {
    return BigInt(actual) >= BigInt(acknowledged);
  } catch {
    return false;
  }
}

async function deleteDriveFile(id: string): Promise<boolean> {
  const response = await googleFetch(`${FILES_URL}/${encodeURIComponent(id)}`, { method: "DELETE" });
  return response.ok;
}

async function runDriveCreate(input: CreateInput): Promise<ToolResult> {
  const { name, content, mimeType } = input;
  const id = await generateFileId();
  if (!id) return { ok: false, output: "drive_create could not reserve an idempotent provider id" };
  const { body, contentType } = buildMultipartBody({ id, name }, content, mimeType ?? DEFAULT_MIME);
  const response = await googleFetch(buildUrl(UPLOAD_URL, { uploadType: "multipart" }), {
    method: "POST",
    headers: { "Content-Type": contentType },
    body,
  });
  if (!response.ok) return { ok: false, output: `drive_create failed: HTTP ${response.status}` };
  const parsed = UploadResponse.safeParse(await response.json());
  const readback = await readDriveContent(id);
  if (!parsed.success || parsed.data.id !== id) {
    const compensated = readback !== null && await deleteDriveFile(id);
    return compensated
      ? { ok: false, output: `drive_create acknowledgement mismatch; deleted file ${id}`, effectDisposition: "compensated" }
      : { ok: false, output: "drive_create provider acknowledgement mismatch", effectDisposition: "unknown" };
  }
  if (readback !== content) {
    const compensated = await deleteDriveFile(id);
    return compensated
      ? { ok: false, output: `drive_create readback mismatch; deleted file ${id}`, effectDisposition: "compensated" }
      : { ok: false, output: `drive_create readback mismatch for ${id}; compensation unavailable`, effectDisposition: "unknown" };
  }
  return {
    ok: true,
    output: `created drive file ${id}`,
    effectDisposition: "confirmed",
    verification: { status: "verified", evidence: `Drive readback matched immutable file id ${id}` },
  };
}

async function compensateDriveUpdate(
  id: string,
  mimeType: string,
  writtenVersion: string | undefined,
  original: string,
): Promise<boolean> {
  if (!writtenVersion || await readDriveVersion(id) !== writtenVersion) return false;
  const restored = await googleFetch(buildUrl(`${UPLOAD_URL}/${id}`, { uploadType: "media", fields: "id,version" }), {
    method: "PATCH",
    headers: { "Content-Type": mimeType },
    body: original,
  });
  if (!restored.ok) return false;
  const parsed = UploadResponse.safeParse(await restored.json());
  return parsed.success && parsed.data.id === id && await readDriveContent(id) === original;
}

async function runDriveUpdate(input: UpdateInput): Promise<ToolResult> {
  const { id, version, content, mimeType } = input;
  if (await readDriveVersion(id) !== version) {
    return { ok: false, output: `drive_update version precondition failed for ${id}`, effectDisposition: "none" };
  }
  const original = await readDriveContent(id);
  if (original === null) return { ok: false, output: `drive_update could not read immutable file ${id}` };
  if (await readDriveVersion(id) !== version) {
    return { ok: false, output: `drive_update version changed before write for ${id}`, effectDisposition: "none" };
  }
  const contentType = mimeType ?? DEFAULT_MIME;
  const response = await googleFetch(buildUrl(`${UPLOAD_URL}/${id}`, { uploadType: "media", fields: "id,version" }), {
    method: "PATCH",
    headers: { "Content-Type": contentType },
    body: content,
  });
  if (!response.ok) return { ok: false, output: `drive_update failed: HTTP ${response.status}` };
  const parsed = UploadResponse.safeParse(await response.json());
  if (!parsed.success || parsed.data.id !== id) return { ok: false, output: "drive_update provider id mismatch", effectDisposition: "unknown" };
  const readbackContent = await readDriveContent(id);
  const readbackVersion = await readDriveVersion(id);
  const versionAdvanced = readbackVersion !== null && readbackVersion !== version;
  const versionMatchesAck = versionAtLeast(readbackVersion, parsed.data.version);
  if (readbackContent !== content || !versionAdvanced || !versionMatchesAck) {
    const compensated = await compensateDriveUpdate(id, contentType, parsed.data.version, original);
    const diagnostic = `content=${readbackContent === content}, versionAdvanced=${versionAdvanced}, versionAck=${versionMatchesAck}`;
    return compensated
      ? { ok: false, output: `drive_update readback mismatch (${diagnostic}); restored original bytes`, effectDisposition: "compensated" }
      : { ok: false, output: `drive_update readback mismatch (${diagnostic}); compensation unavailable`, effectDisposition: "unknown" };
  }
  return {
    ok: true,
    output: `updated drive file ${id}`,
    effectDisposition: "confirmed",
    verification: { status: "verified", evidence: `Drive readback matched immutable file id ${id} and advanced provider version` },
  };
}

/**
 * Build a multipart/related body for the Drive upload endpoint: a JSON metadata
 * part followed by a media part. Exported for unit testing the wire format.
 */
export function buildMultipartBody(
  metadata: Record<string, unknown>,
  content: string,
  mimeType: string,
): { body: string; contentType: string } {
  const body =
    `--${BOUNDARY}\r\n` +
    "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
    `${JSON.stringify(metadata)}\r\n` +
    `--${BOUNDARY}\r\n` +
    `Content-Type: ${mimeType}\r\n\r\n` +
    `${content}\r\n` +
    `--${BOUNDARY}--`;
  return { body, contentType: `multipart/related; boundary=${BOUNDARY}` };
}

function failFromError(err: unknown): { ok: false; output: string } {
  return { ok: false, output: (err as Error).message };
}

export const driveCreateTool: Tool = {
  schema: {
    name: "drive_create",
    description:
      "Create a new file in Google Drive with the given name and text content. Always requires approval.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "File name" },
        content: { type: "string", description: "File contents" },
        mimeType: { type: "string", description: "MIME type (default text/plain)" },
      },
      required: ["name", "content"],
    },
  },
  describeForSafety: () => "create a drive file",
  async execute(raw, ctx) {
    const parsed = CreateArgs.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, output: 'drive_create needs "name" and "content"' };
    }
    const approved = await ctx.requestApproval("create a drive file", "creates a file in your Drive");
    if (!approved) return { ok: false, output: "denied by user" };
    try {
      return await runDriveCreate(parsed.data);
    } catch (err) {
      return failFromError(err);
    }
  },
};

export const driveUpdateTool: Tool = {
  schema: {
    name: "drive_update",
    description:
      "Replace the content of an existing Google Drive file by id. Always requires approval.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Drive file id" },
        version: { type: "string", description: "Current monotonically increasing Drive file version" },
        content: { type: "string", description: "New file contents" },
        mimeType: { type: "string", description: "MIME type (default text/plain)" },
      },
      required: ["id", "version", "content"],
    },
  },
  describeForSafety: () => "update a drive file",
  async execute(raw, ctx) {
    const parsed = UpdateArgs.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, output: 'drive_update needs "id", current "version" precondition, and "content"' };
    }
    const approved = await ctx.requestApproval("update a drive file", "overwrites the content of an existing file in your Drive");
    if (!approved) return { ok: false, output: "denied by user" };
    try {
      return await runDriveUpdate(parsed.data);
    } catch (err) {
      return failFromError(err);
    }
  },
};
