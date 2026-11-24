import { useCallback, useState } from "react";
import { useComposerCapture } from "./use-composer-capture.js";
import { appendAttachmentReferences } from "../../src/desktop/attachment-text.js";
import { clipboardFilesToImages, mergeClipboardImages } from "./clipboard-paste.js";
import {
  attachmentItemForFile,
  normalizedAttachmentItems,
  pickDesktopAttachments,
  resolveDesktopDroppedFiles,
  type DesktopAttachmentItem,
  type DesktopAttachmentSelection,
} from "./desktop-attachments.js";
import type { DesktopImageAttachment } from "./types.js";

export function useComposerAttachments() {
  const [items, setItems] = useState<DesktopAttachmentItem[]>([]);
  const [images, setImages] = useState<DesktopImageAttachment[]>([]);
  const [error, setError] = useState("");
  const { capturing, captureLook } = useComposerCapture(setImages, setError);
  const files = [...new Set(items.flatMap((item) => item.files))];

  const applySelection = useCallback((selection: DesktopAttachmentSelection) => {
    const merged = mergeAttachmentItems(items, normalizedAttachmentItems(selection), 50);
    setItems(merged.items);
    const limitError = merged.truncated ? "Only the first 50 files were attached." : "";
    setError([...new Set([...selection.errors, limitError].filter(Boolean))].join(" "));
  }, [items]);
  const addFile = useCallback((file: string) => {
    setItems((current) => mergeAttachmentItems(current, [attachmentItemForFile(file)], 50).items);
    setError("");
  }, []);
  const removeItem = useCallback((id: string) => setItems((current) => current.filter((entry) => entry.id !== id)), []);
  const removeImage = useCallback((id: string) => {
    setImages((current) => current.filter((image) => image.id !== id));
    setError("");
  }, []);

  const pasteImages = useCallback(async (pasted: File[]) => {
    const result = await clipboardFilesToImages(pasted);
    setImages((current) => mergeClipboardImages(current, result.images));
    setError(result.errors.join(" "));
  }, []);

  const dropFiles = useCallback(async (dropped: File[]) => {
    try {
      applySelection(await resolveDesktopDroppedFiles(dropped));
    } catch (reason) {
      setError(`Could not attach the dropped items. ${reason instanceof Error ? reason.message : String(reason)}`);
    }
  }, [applySelection]);

  const pickFiles = useCallback(async () => {
    try {
      applySelection(await pickDesktopAttachments());
    } catch (reason) {
      setError(`Could not open the attachment picker. ${reason instanceof Error ? reason.message : String(reason)}`);
    }
  }, [applySelection]);

  const clear = useCallback(() => { setItems([]); setImages([]); setError(""); }, []);

  return { files, items, images, error, capturing, addFile, removeItem, removeImage, pasteImages, dropFiles, pickFiles, captureLook, clear };
}

export function withProjectAttachments(text: string, files: string[]): string {
  return appendAttachmentReferences(text, files);
}


export function mergeAttachmentItems(
  current: DesktopAttachmentItem[],
  incoming: DesktopAttachmentItem[],
  maximum: number,
): { items: DesktopAttachmentItem[]; truncated: boolean } {
  const items = current.map((item) => ({ ...item, files: [...item.files] }));
  const byId = new Map(items.map((item) => [item.id, item]));
  const seenFiles = new Set(items.flatMap((item) => item.files));
  let truncated = false;

  for (const item of incoming) {
    const available = item.files.filter((file) => !seenFiles.has(file));
    const capacity = Math.max(0, maximum - seenFiles.size);
    const accepted = available.slice(0, capacity);
    if (accepted.length < available.length) truncated = true;
    if (!accepted.length) continue;
    for (const file of accepted) seenFiles.add(file);
    const existing = byId.get(item.id);
    if (existing) existing.files.push(...accepted);
    else {
      const next = { ...item, files: accepted };
      items.push(next);
      byId.set(next.id, next);
    }
  }
  return { items, truncated };
}
