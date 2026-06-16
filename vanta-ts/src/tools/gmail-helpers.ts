import { z } from "zod";
import { googleFetch } from "../google/client.js";
import type { ToolResult } from "./types.js";

export const HeaderSchema = z.object({ name: z.string(), value: z.string() }).passthrough();
export type Header = z.infer<typeof HeaderSchema>;

export function headerValue(headers: Header[], name: string): string {
  const lower = name.toLowerCase();
  return headers.find((h) => h.name.toLowerCase() === lower)?.value ?? "";
}

export function encodeMime(to: string, subject: string, body: string): string {
  const mime = [
    `To: ${to}`,
    `Subject: ${subject}`,
    "From: me",
    'Content-Type: text/plain; charset="UTF-8"',
    "MIME-Version: 1.0",
    "",
    body,
  ].join("\r\n");
  return Buffer.from(mime, "utf8").toString("base64url");
}

export type Payload = {
  mimeType?: string;
  body?: { data?: string };
  parts?: Payload[];
};

export const PayloadSchema: z.ZodType<Payload> = z.lazy(() =>
  z
    .object({
      mimeType: z.string().optional(),
      body: z.object({ data: z.string().optional() }).passthrough().optional(),
      parts: z.array(PayloadSchema).optional(),
    })
    .passthrough(),
);

const decodeData = (data: string): string => Buffer.from(data, "base64url").toString("utf8");

export function extractPlainText(payload: Payload): string {
  if (payload.mimeType === "text/plain" && payload.body?.data) return decodeData(payload.body.data);
  for (const part of payload.parts ?? []) {
    const found = extractPlainText(part);
    if (found) return found;
  }
  return payload.body?.data ? decodeData(payload.body.data) : "";
}

export async function httpError(res: Response): Promise<ToolResult> {
  const body = await res.text().catch(() => "");
  return { ok: false, output: `gmail HTTP ${res.status}: ${body.slice(0, 500)}` };
}

export const authError = (err: unknown): ToolResult => ({
  ok: false,
  output: (err as Error).message,
});

export const OutboundArgs = z.object({
  to: z.string().min(1),
  subject: z.string().min(1),
  body: z.string().min(1),
});

export const IdResponse = z.object({ id: z.string() }).passthrough();

export { googleFetch };
