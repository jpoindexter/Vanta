import { z } from "zod";
import type { Tool } from "./types.js";
import { googleFetch, buildUrl } from "../google/client.js";

/** Max chars returned by drive_read — large files are truncated, not refused. */
const MAX_READ_CHARS = 80_000;
const DEFAULT_MIME = "text/plain";
/** Stable multipart boundary; ASCII-safe and unlikely to collide with content. */
const BOUNDARY = "argo_drive_boundary_7f3a9c1e";

const FILES_URL = "https://www.googleapis.com/drive/v3/files";
const UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";

const ReadArgs = z.object({ id: z.string().min(1) });
const CreateArgs = z.object({
  name: z.string().min(1),
  content: z.string(),
  mimeType: z.string().min(1).optional(),
});
const UpdateArgs = z.object({
  id: z.string().min(1),
  content: z.string(),
  mimeType: z.string().min(1).optional(),
});

/** Drive returns {id} on upload; parsed defensively (external JSON). */
const UploadResponse = z.object({ id: z.string() }).passthrough();

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

function cap(text: string): string {
  return text.length > MAX_READ_CHARS
    ? `${text.slice(0, MAX_READ_CHARS)}\n…[truncated at ${MAX_READ_CHARS} chars]`
    : text;
}

/** Turn a thrown auth/network error into an actionable tool result. */
function failFromError(err: unknown): { ok: false; output: string } {
  return { ok: false, output: (err as Error).message };
}

export const driveReadTool: Tool = {
  schema: {
    name: "drive_read",
    description:
      "Read a Google Drive file's text content by file id. Falls back to plain-text export for Google-native docs.",
    parameters: {
      type: "object",
      properties: { id: { type: "string", description: "Drive file id" } },
      required: ["id"],
    },
  },
  describeForSafety: () => "read a drive file",
  async execute(raw) {
    const parsed = ReadArgs.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, output: 'drive_read needs an "id" string' };
    }
    const { id } = parsed.data;
    try {
      const media = await googleFetch(
        buildUrl(`${FILES_URL}/${id}`, { alt: "media" }),
        { method: "GET" },
      );
      if (media.ok) {
        return { ok: true, output: cap(await media.text()) };
      }
      // Google-native docs (Docs/Sheets/Slides) reject alt=media — export instead.
      const exported = await googleFetch(
        buildUrl(`${FILES_URL}/${id}/export`, { mimeType: DEFAULT_MIME }),
        { method: "GET" },
      );
      if (exported.ok) {
        return { ok: true, output: cap(await exported.text()) };
      }
      return {
        ok: false,
        output: `drive_read failed: HTTP ${media.status} (and export HTTP ${exported.status}) for file ${id}`,
      };
    } catch (err) {
      return failFromError(err);
    }
  },
};

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
        mimeType: {
          type: "string",
          description: "MIME type (default text/plain)",
        },
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
    const approved = await ctx.requestApproval(
      "create a drive file",
      "creates a file in your Drive",
    );
    if (!approved) {
      return { ok: false, output: "denied by user" };
    }
    const { name, content, mimeType } = parsed.data;
    const { body, contentType } = buildMultipartBody(
      { name },
      content,
      mimeType ?? DEFAULT_MIME,
    );
    try {
      const r = await googleFetch(
        buildUrl(UPLOAD_URL, { uploadType: "multipart" }),
        { method: "POST", headers: { "Content-Type": contentType }, body },
      );
      if (!r.ok) {
        return { ok: false, output: `drive_create failed: HTTP ${r.status}` };
      }
      const json = UploadResponse.safeParse(await r.json());
      if (!json.success) {
        return { ok: false, output: "drive_create: unexpected response shape" };
      }
      return { ok: true, output: `created drive file ${json.data.id}` };
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
        content: { type: "string", description: "New file contents" },
        mimeType: {
          type: "string",
          description: "MIME type (default text/plain)",
        },
      },
      required: ["id", "content"],
    },
  },
  describeForSafety: () => "update a drive file",
  async execute(raw, ctx) {
    const parsed = UpdateArgs.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, output: 'drive_update needs "id" and "content"' };
    }
    const approved = await ctx.requestApproval(
      "update a drive file",
      "overwrites the content of an existing file in your Drive",
    );
    if (!approved) {
      return { ok: false, output: "denied by user" };
    }
    const { id, content, mimeType } = parsed.data;
    try {
      const r = await googleFetch(
        buildUrl(`${UPLOAD_URL}/${id}`, { uploadType: "media" }),
        {
          method: "PATCH",
          headers: { "Content-Type": mimeType ?? DEFAULT_MIME },
          body: content,
        },
      );
      if (!r.ok) {
        return { ok: false, output: `drive_update failed: HTTP ${r.status}` };
      }
      return { ok: true, output: `updated drive file ${id}` };
    } catch (err) {
      return failFromError(err);
    }
  },
};
