import { useRef, useState, type ClipboardEvent, type DragEvent, type FormEvent, type KeyboardEvent } from "react";
import { ArrowUp, Folder, ListPlus, Paperclip, Plus, Square, Upload, X } from "lucide-react";
import { AccessModePicker } from "./access-mode-picker.js";
import { clipboardImageFiles, imagePreviewUrl, insertClipboardText } from "./clipboard-paste.js";
import { nativeClipboardAvailable, readNativeClipboard } from "./desktop-clipboard.js";
import { desktopLookCommand, LookCaptureButton } from "./look-capture-button.js";
import type { DesktopMcpSummary } from "./mcp-types.js";
import type { AccessMode, DesktopImageAttachment, DesktopLookMode } from "./types.js";
import type { DesktopAttachmentItem } from "./desktop-attachments.js";

export type ComposerProps = {
  value: string;
  busy: boolean;
  ready?: boolean;
  model?: string;
  root?: string;
  tools?: number;
  mcp?: DesktopMcpSummary;
  accessMode: AccessMode;
  attachments: DesktopAttachmentItem[];
  images?: DesktopImageAttachment[];
  attachmentError?: string;
  lookBusy?: boolean;
  onChange: (value: string) => void;
  onSubmit: (text: string) => void;
  onQueue: (text: string) => void;
  onRemoveAttachment: (id: string) => void;
  onRemoveImage?: (id: string) => void;
  onPasteImages?: (files: File[]) => void | Promise<void>;
  onDropFiles?: (files: File[]) => void | Promise<void>;
  onLookCapture: (mode: DesktopLookMode) => unknown | Promise<unknown>;
  onStop: () => void;
  onAttach: () => void;
  onMcp: () => void;
  onModel: () => void;
  onAccessMode: (mode: AccessMode) => Promise<void>;
  onCommand: () => void;
};

export function Composer(props: ComposerProps) {
  const ready = props.ready ?? true;
  const images = props.images ?? [];
  const dragDepth = useRef(0);
  const [dropActive, setDropActive] = useState(false);
  const canSend = Boolean(props.value.trim() || images.length || props.attachments.length);
  function send(event: FormEvent) {
    event.preventDefault();
    const lookMode = desktopLookCommand(props.value);
    if (lookMode) { props.onChange(""); void props.onLookCapture(lookMode); return; }
    const value = props.value.trim() || attachmentPrompt(props.attachments.length, images.length);
    if (!value) return;
    if (props.busy && (images.length || props.attachments.length)) return;
    if (props.busy) props.onQueue(value);
    else props.onSubmit(value);
  }
  function dragEnter(event: DragEvent<HTMLFormElement>) {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    dragDepth.current += 1;
    setDropActive(true);
  }
  function dragOver(event: DragEvent<HTMLFormElement>) {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }
  function dragLeave(event: DragEvent<HTMLFormElement>) {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (!dragDepth.current) setDropActive(false);
  }
  function drop(event: DragEvent<HTMLFormElement>) {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    dragDepth.current = 0;
    setDropActive(false);
    const files = Array.from(event.dataTransfer.files);
    if (files.length) void props.onDropFiles?.(files);
  }
  return <form className={`composer ${dropActive ? "drop-active" : ""}`} data-drop-active={dropActive ? "true" : "false"} aria-describedby="vanta-attachment-help" onSubmit={send} onDragEnter={dragEnter} onDragOver={dragOver} onDragLeave={dragLeave} onDrop={drop}>
    {dropActive ? <div className="composer-drop-target" role="status" aria-live="polite"><Upload size={22} /><strong>Drop files or folders to attach</strong><span>Folders stay compact while readable files are attached.</span></div> : null}
    <p className="sr-only" id="vanta-attachment-help">Drag files or folders here, or use the attachment button.</p>
    <label className="sr-only" htmlFor="vanta-composer">Message Vanta</label>
    <textarea id="vanta-composer" value={props.value} disabled={!ready} onChange={(event) => props.onChange(event.target.value)} onPaste={(event) => void pasteImages(event, props)} onKeyDown={(event) => keyDown(event, props)} placeholder={!ready ? "Loading this project..." : props.busy ? "Queue next..." : "Ask Vanta to do something..."} />
    <AttachmentChips items={props.attachments} images={images} onRemoveItem={props.onRemoveAttachment} onRemoveImage={props.onRemoveImage} />
    {props.attachmentError ? <p className="composer-attachment-error" role="alert">{props.attachmentError}</p> : null}
    <ComposerFooter {...props} ready={ready} canSend={canSend} hasImages={images.length > 0} />
  </form>;
}

function AttachmentChips(props: { items: DesktopAttachmentItem[]; images: DesktopImageAttachment[]; onRemoveItem: (id: string) => void; onRemoveImage?: (id: string) => void }) {
  if (!props.items.length && !props.images.length) return null;
  return <div className="context-chips" aria-label="Attached project context">
    {props.items.map((item) => item.kind === "folder"
      ? <span className="folder-context-chip" key={item.id} title={`${item.path} · ${item.files.length} readable ${item.files.length === 1 ? "file" : "files"}`} aria-label={`Folder ${item.label} with ${item.files.length} readable ${item.files.length === 1 ? "file" : "files"}`}><Folder size={18} aria-hidden="true" /><RemoveButton label={`Remove folder ${item.label}`} onClick={() => props.onRemoveItem(item.id)} /></span>
      : <span key={item.id}><span title={item.path}>{item.path}</span><RemoveButton label={`Remove ${item.path}`} onClick={() => props.onRemoveItem(item.id)} /></span>)}
    {props.images.map((image) => <span className="image-context-chip" key={image.id}><img src={imagePreviewUrl(image)} alt="" /><span title={image.name}>{image.capture ? `LOOK · ${image.capture.mode}` : image.name}</span><RemoveButton label={`Remove ${image.name}`} onClick={() => props.onRemoveImage?.(image.id)} /></span>)}
  </div>;
}

function RemoveButton(props: { label: string; onClick: () => void }) {
  return <button type="button" aria-label={props.label} title={props.label} onClick={props.onClick}><X size={13} /></button>;
}

function ComposerFooter(props: ComposerProps & { ready: boolean; canSend: boolean; hasImages: boolean }) {
  const hasFileAttachments = props.attachments.length > 0;
  const queueDisabled = !props.ready || !props.value.trim() || props.hasImages || hasFileAttachments;
  const queueTitle = props.hasImages || hasFileAttachments ? "Wait for the active run before sending attachment context" : "Queue next";
  return <div className="composer-footer"><div className="composer-context-controls"><button className="composer-context-button" type="button" title="Attach files or folders" aria-label="Attach files or folders" onClick={props.onAttach}><Paperclip size={16} /><span className="sr-only">Attachments</span></button><LookCaptureButton busy={props.lookBusy} onCapture={props.onLookCapture} /><button className="composer-command-button" type="button" title="Open commands" aria-label="Open commands" onClick={props.onCommand}><Plus size={16} /><span className="sr-only">Commands</span></button></div><div className="composer-actions"><button className="model-button" type="button" title="Change agent model" aria-label={`Agent model: ${props.model ?? "not selected"}. Change model`} onClick={props.onModel}><small>Agent model</small><span>{props.model ?? "Choose model"}</span></button><AccessModePicker mode={props.accessMode} onChange={props.onAccessMode} />{props.busy ? <><button className="queue-button" type="submit" disabled={queueDisabled} title={queueTitle}><ListPlus size={15} /><span>Queue next</span></button><button className="stop-button" type="button" title="Stop task" aria-label="Stop task" onClick={props.onStop}><Square size={14} /><span>Stop task</span></button></> : <button className="send-button" type="submit" disabled={!props.ready || !props.canSend} aria-label="Send"><ArrowUp size={16} /></button>}</div></div>;
}

async function pasteImages(event: ClipboardEvent<HTMLTextAreaElement>, props: ComposerProps): Promise<void> {
  const browserFiles = clipboardImageFiles(event.clipboardData);
  const useNative = nativeClipboardAvailable();
  if (!browserFiles.length && !useNative) return;
  event.preventDefault();
  const target = event.currentTarget;
  let text = event.clipboardData.getData("text/plain");
  let files = browserFiles;
  if (useNative) {
    const native = await readNativeClipboard().catch(() => ({ text: "", files: [] }));
    text ||= native.text;
    if (!files.length) files = native.files;
  }
  if (text) {
    const inserted = insertClipboardText(props.value, text, target.selectionStart, target.selectionEnd);
    props.onChange(inserted.value);
    requestAnimationFrame(() => target.setSelectionRange(inserted.cursor, inserted.cursor));
  }
  if (files.length) await props.onPasteImages?.(files);
}

function keyDown(event: KeyboardEvent<HTMLTextAreaElement>, props: Pick<ComposerProps, "value" | "onAttach" | "onCommand">) {
  if (!props.value && event.key === "@") { event.preventDefault(); props.onAttach(); return; }
  if (!props.value && event.key === "/") { event.preventDefault(); props.onCommand(); return; }
  if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); }
}

function hasDraggedFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer.types).includes("Files");
}

function attachmentPrompt(fileCount: number, imageCount: number): string {
  if (fileCount && imageCount) return "Review the attached files and images.";
  if (fileCount) return "Review the attached files.";
  if (imageCount) return "Describe the attached image.";
  return "";
}
