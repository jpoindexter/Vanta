import { describe, it, expect } from "vitest";
import { inboundToAgentInput, hasMedia } from "./media.js";
import type { InboundMessage } from "./platforms/base.js";

const base = (over: Partial<InboundMessage> = {}): InboundMessage => ({ chatId: "c1", text: "", ...over });

describe("hasMedia", () => {
  it("is false without media, true with", () => {
    expect(hasMedia(base())).toBe(false);
    expect(hasMedia(base({ media: [{ kind: "image", mime: "image/png", dataBase64: "x" }] }))).toBe(true);
  });
});

describe("inboundToAgentInput — images → vision", () => {
  it("passes inline image bytes through as ImageAttachments", async () => {
    const inbound = base({ text: "what is this?", media: [{ kind: "image", mime: "image/jpeg", dataBase64: "AAA" }] });
    const { text, images } = await inboundToAgentInput(inbound);
    expect(text).toBe("what is this?");
    expect(images).toEqual([{ mime: "image/jpeg", dataBase64: "AAA" }]);
  });
  it("fetches an image url → base64 via the injected fetch", async () => {
    const inbound = base({ media: [{ kind: "image", mime: "image/png", url: "http://x/p.png" }] });
    const { images } = await inboundToAgentInput(inbound, { fetchBase64: async () => "FETCHED" });
    expect(images).toEqual([{ mime: "image/png", dataBase64: "FETCHED" }]);
  });
  it("drops an image whose fetch fails (degrades, never throws)", async () => {
    const inbound = base({ media: [{ kind: "image", mime: "image/png", url: "http://x/p.png" }] });
    const { images } = await inboundToAgentInput(inbound, { fetchBase64: async () => null });
    expect(images).toEqual([]);
  });
});

describe("inboundToAgentInput — voice → STT", () => {
  it("transcribes a voice memo and folds it into the text", async () => {
    const inbound = base({ text: "", media: [{ kind: "audio", mime: "audio/ogg", dataBase64: "OGG" }] });
    const { text, images } = await inboundToAgentInput(inbound, { transcribe: async () => "remind me at five" });
    expect(text).toBe("[voice memo] remind me at five");
    expect(images).toEqual([]);
  });
  it("appends the transcript after existing caption text", async () => {
    const inbound = base({ text: "ps:", media: [{ kind: "audio", mime: "audio/ogg", dataBase64: "OGG" }] });
    const { text } = await inboundToAgentInput(inbound, { transcribe: async () => "hello" });
    expect(text).toBe("ps:\n[voice memo] hello");
  });
  it("skips audio when no transcribe dep is supplied", async () => {
    const inbound = base({ text: "x", media: [{ kind: "audio", mime: "audio/ogg", dataBase64: "OGG" }] });
    const { text } = await inboundToAgentInput(inbound, {});
    expect(text).toBe("x");
  });
  it("a failed transcription degrades to no voice text", async () => {
    const inbound = base({ text: "x", media: [{ kind: "audio", mime: "audio/ogg", dataBase64: "OGG" }] });
    const { text } = await inboundToAgentInput(inbound, { transcribe: async () => { throw new Error("whisper down"); } });
    expect(text).toBe("x");
  });
});

describe("inboundToAgentInput — mixed", () => {
  it("handles an image + a voice memo in one message", async () => {
    const inbound = base({
      text: "see attached",
      media: [
        { kind: "image", mime: "image/png", dataBase64: "IMG" },
        { kind: "audio", mime: "audio/ogg", dataBase64: "AUD" },
      ],
    });
    const { text, images } = await inboundToAgentInput(inbound, { transcribe: async () => "and listen" });
    expect(images).toEqual([{ mime: "image/png", dataBase64: "IMG" }]);
    expect(text).toBe("see attached\n[voice memo] and listen");
  });
});
