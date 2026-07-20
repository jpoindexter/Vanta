import type { ClipboardEvent, FormEvent, KeyboardEvent } from "react";
import { ArrowUp, FolderKanban, Laptop, ListPlus, Network, PackageOpen, Paperclip, Plug, Plus, Square, X } from "lucide-react";
import { AccessModePicker } from "./access-mode-picker.js";
import { clipboardImageFiles, imagePreviewUrl, insertClipboardText } from "./clipboard-paste.js";
import { nativeClipboardAvailable, readNativeClipboard } from "./desktop-clipboard.js";
import { desktopLookCommand, LookCaptureButton } from "./look-capture-button.js";
import type { DesktopMcpSummary } from "./mcp-types.js";
import type { AccessMode, DesktopImageAttachment, DesktopLookMode } from "./types.js";

export type ComposerProps = {
  value: string;
  busy: boolean;
  ready?: boolean;
  model?: string;
  root?: string;
  tools?: number;
  mcp?: DesktopMcpSummary;
  accessMode: AccessMode;
  attachments: string[];
  images?: DesktopImageAttachment[];
  attachmentError?: string;
  lookBusy?: boolean;
  onChange: (value: string) => void;
  onSubmit: (text: string) => void;
  onQueue: (text: string) => void;
  onRemoveAttachment: (file: string) => void;
  onRemoveImage?: (id: string) => void;
  onPasteImages?: (files: File[]) => void | Promise<void>;
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
  const canSend = Boolean(props.value.trim() || images.length);
  function send(event: FormEvent) {
    event.preventDefault();
    const lookMode = desktopLookCommand(props.value);
    if (lookMode) { props.onChange(""); void props.onLookCapture(lookMode); return; }
    const value = props.value.trim() || (images.length ? "Describe the attached image." : "");
    if (!value) return;
    if (props.busy) props.onQueue(value);
    else props.onSubmit(value);
  }
  return <form className="composer" onSubmit={send}>
    <TaskContext root={props.root} tools={props.tools} mcp={props.mcp} onMcp={props.onMcp} />
    <label className="sr-only" htmlFor="vanta-composer">Message Vanta</label>
    <textarea id="vanta-composer" value={props.value} disabled={!ready} onChange={(event) => props.onChange(event.target.value)} onPaste={(event) => void pasteImages(event, props)} onKeyDown={(event) => keyDown(event, props)} placeholder={!ready ? "Loading this project..." : props.busy ? "Queue the next instruction..." : "Ask Vanta to do something..."} />
    <AttachmentChips files={props.attachments} images={images} onRemoveFile={props.onRemoveAttachment} onRemoveImage={props.onRemoveImage} />
    {props.attachmentError ? <p className="composer-attachment-error" role="alert">{props.attachmentError}</p> : null}
    <ComposerFooter {...props} ready={ready} canSend={canSend} hasImages={images.length > 0} />
  </form>;
}

function TaskContext(props: Pick<ComposerProps, "root" | "tools" | "mcp" | "onMcp">) {
  return <div className="task-context" aria-label="Task execution context: Session model, project, host, tools, MCP, and local memory"><span><FolderKanban size={12} /><strong>{props.root?.split("/").filter(Boolean).at(-1) ?? "Project"}</strong></span><span><Laptop size={12} /><strong>Local Mac</strong></span><span><Network size={12} /><strong>Tools {props.tools ?? 0}</strong></span><button type="button" title="Manage MCP connectors" onClick={props.onMcp}><Plug size={12} /><strong>MCP {props.mcp?.servers ?? 0} · {props.mcp?.tools ?? 0} tools</strong></button><span><PackageOpen size={12} /><strong>Memory local</strong></span></div>;
}

function AttachmentChips(props: { files: string[]; images: DesktopImageAttachment[]; onRemoveFile: (file: string) => void; onRemoveImage?: (id: string) => void }) {
  if (!props.files.length && !props.images.length) return null;
  return <div className="context-chips" aria-label="Attached project context">
    {props.files.map((file) => <span key={file}><span title={file}>{file}</span><RemoveButton label={`Remove ${file}`} onClick={() => props.onRemoveFile(file)} /></span>)}
    {props.images.map((image) => <span className="image-context-chip" key={image.id}><img src={imagePreviewUrl(image)} alt="" /><span title={image.name}>{image.capture ? `LOOK · ${image.capture.mode}` : image.name}</span><RemoveButton label={`Remove ${image.name}`} onClick={() => props.onRemoveImage?.(image.id)} /></span>)}
  </div>;
}

function RemoveButton(props: { label: string; onClick: () => void }) {
  return <button type="button" aria-label={props.label} title={props.label} onClick={props.onClick}><X size={13} /></button>;
}

function ComposerFooter(props: ComposerProps & { ready: boolean; canSend: boolean; hasImages: boolean }) {
  const queueDisabled = !props.ready || !props.value.trim() || props.hasImages;
  return <div className="composer-footer"><div className="composer-context-controls"><button className="composer-context-button" type="button" title="Attach project files" aria-label="Attach project files" onClick={props.onAttach}><Paperclip size={16} /><span className="sr-only">Context</span></button><LookCaptureButton busy={props.lookBusy} onCapture={props.onLookCapture} /><button className="composer-command-button" type="button" title="Open commands" aria-label="Open commands" onClick={props.onCommand}><Plus size={16} /><span className="sr-only">Commands</span></button></div><div className="composer-actions"><button className="model-button" type="button" title="Change agent model" aria-label={`Agent model: ${props.model ?? "not selected"}. Change model`} onClick={props.onModel}><small>Agent model</small><span>{props.model ?? "Choose model"}</span></button><AccessModePicker mode={props.accessMode} onChange={props.onAccessMode} />{props.busy ? <><button className="queue-button" type="submit" disabled={queueDisabled} title={props.hasImages ? "Wait for the active run before sending image context" : "Queue next instruction"}><ListPlus size={15} /><span>Queue</span></button><button className="stop-button" type="button" title="Stop current run" aria-label="Stop current run" onClick={props.onStop}><Square size={14} /><span>Stop</span></button></> : <button className="send-button" type="submit" disabled={!props.ready || !props.canSend} aria-label="Send"><ArrowUp size={16} /></button>}</div></div>;
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
