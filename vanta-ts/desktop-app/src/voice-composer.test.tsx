import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { parseHTML } from "linkedom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Composer, type ComposerProps } from "./composer.js";
import { deferred, FakeVoiceRecorder } from "./voice-test-fixtures.js";

let tree: Root, host: HTMLElement, props: ComposerProps;
let capture: ReturnType<typeof vi.fn>, stopTrack: ReturnType<typeof vi.fn>;
let response: ReturnType<typeof deferred<Response>>;
let requests: { path: string; init?: RequestInit }[];
const json = (body: unknown) => new Response(JSON.stringify(body));

beforeEach(() => {
  const { window, document } = parseHTML("<html><body><div id='root'></div></body></html>");
  for (const [key, value] of Object.entries({ window, document, Element: window.Element,
    HTMLElement: window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) vi.stubGlobal(key, value);
  stopTrack = vi.fn();
  capture = vi.fn().mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] });
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: capture } });
  vi.stubGlobal("MediaRecorder", FakeVoiceRecorder);
  FakeVoiceRecorder.instances = [];
  response = deferred<Response>(); requests = [];
  vi.stubGlobal("fetch", vi.fn((path: string, init?: RequestInit) => {
    requests.push({ path, init });
    return path === "/api/voice" ? Promise.resolve(json({ ready: true, provider: "local-whisper", model: "tiny" })) : response.promise;
  }));
  host = document.getElementById("root")!; tree = createRoot(host);
  props = { sessionId: "first", root: "/project", value: "Draft", ready: true, busy: false, accessMode: "approve", attachments: [],
    onChange: vi.fn(), onSubmit: vi.fn(), onQueue: vi.fn(), onRemoveAttachment: vi.fn(), onLookCapture: vi.fn(),
    onStop: vi.fn(), onAttach: vi.fn(), onMcp: vi.fn(), onModel: vi.fn(), onAccessMode: vi.fn(), onCommand: vi.fn() };
});
afterEach(async () => { await act(async () => tree.unmount()); vi.unstubAllGlobals(); });
const render = async () => act(async () => tree.render(<Composer {...props} />));
const click = async (label: string) => act(async () => host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!.click());
async function record() { await render(); await click("Dictate a message"); FakeVoiceRecorder.instances.at(-1)!.chunk(); }
async function resolveText(text = "spoken text") { await act(async () => response.resolve(json({ text, provider: "local-whisper", model: "tiny" }))); }
async function key(init: Record<string, unknown>, target: EventTarget = window) {
  const event = new window.Event("keydown", { bubbles: true, cancelable: true });
  Object.assign(event, init);
  await act(async () => target.dispatchEvent(event));
  return event;
}

describe("composer dictation", () => {
  it("captures audio only after click and appends to the latest edited draft without autosending", async () => {
    await render(); expect(capture).not.toHaveBeenCalled();
    await click("Dictate a message");
    expect(capture).toHaveBeenCalledWith({ audio: true, video: false });
    FakeVoiceRecorder.instances.at(-1)!.chunk();
    expect(host.textContent).toContain("Recording");
    expect(host.querySelector("button[aria-label=Send]")!.hasAttribute("disabled")).toBe(true);
    await click("Stop recording and transcribe");
    expect(stopTrack).toHaveBeenCalled(); expect(host.textContent).toContain("Transcribing locally");
    props = { ...props, value: "Draft edited while transcribing" }; await render(); await resolveText();
    expect(props.onChange).toHaveBeenCalledWith("Draft edited while transcribing spoken text");
    expect(props.onSubmit).not.toHaveBeenCalled(); expect(props.onQueue).not.toHaveBeenCalled();
  });
  it("blocks direct form submission during dictation and keeps the draft after cancel", async () => {
    await record();
    await act(async () => { host.querySelector("form")!.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })); });
    expect(props.onSubmit).not.toHaveBeenCalled();
    await click("Cancel dictation");
    expect(stopTrack).toHaveBeenCalled(); expect(props.onChange).not.toHaveBeenCalled();
    expect(host.querySelector("textarea")!.value).toBe("Draft");
  });
  it("aborts and ignores a transcription after switching conversations", async () => {
    await record(); await click("Stop recording and transcribe");
    const signal = requests.find((r) => r.path.endsWith("transcribe"))!.init!.signal!;
    props = { ...props, sessionId: "second", value: "Other draft" }; await render();
    expect(signal.aborted).toBe(true); await resolveText();
    expect(props.onChange).not.toHaveBeenCalled(); expect(host.querySelector("textarea")!.value).toBe("Other draft");
  });
  it("releases a late permission stream after switching conversations", async () => {
    const permission = deferred<MediaStream>(); capture.mockReturnValue(permission.promise);
    await render(); await click("Dictate a message");
    props = { ...props, sessionId: "second" }; await render();
    await act(async () => permission.resolve({ getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream));
    expect(stopTrack).toHaveBeenCalled(); expect(FakeVoiceRecorder.instances).toHaveLength(0);
  });
  it("releases live recording on unmount", async () => {
    await record(); await act(async () => tree.render(<div />));
    expect(stopTrack).toHaveBeenCalled(); expect(requests).toHaveLength(1);
  });
  it("toggles with Cmd/Ctrl Shift D, cancels with Escape, and leaves other inputs alone", async () => {
    await render();
    expect(host.querySelector(".voice-button")!.getAttribute("aria-keyshortcuts")).toContain("Control+Shift+D");
    await key({ code: "KeyD", key: "D", ctrlKey: true, shiftKey: true });
    expect(capture).toHaveBeenCalledOnce();
    FakeVoiceRecorder.instances.at(-1)!.chunk();
    await key({ code: "KeyD", key: "D", metaKey: true, shiftKey: true });
    expect(host.textContent).toContain("Transcribing locally");
    await key({ key: "Escape" }); await resolveText(); expect(props.onChange).not.toHaveBeenCalled();
    const input = document.createElement("input"); document.body.append(input);
    await key({ code: "KeyD", key: "D", ctrlKey: true, shiftKey: true }, input);
    expect(capture).toHaveBeenCalledOnce();
    expect((await key({ key: "Escape" })).defaultPrevented).toBe(false);
  });
});
