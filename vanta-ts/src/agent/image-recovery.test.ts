import { describe, it, expect } from "vitest";
import { stripHistoricalImages, stripAllImages } from "./image-recovery.js";
import type { Message, ImageAttachment } from "../types.js";

// HARNESS-IMAGE-SHRINK — strip historical media on compaction; strip-and-retry on 413.

const img: ImageAttachment = { mime: "image/png", dataBase64: "AAAA" };
const userImg = (text: string): Message => ({ role: "user", content: text, images: [img] });
const userText = (text: string): Message => ({ role: "user", content: text });

describe("stripHistoricalImages", () => {
  it("keeps images only on the most recent image-bearing message", () => {
    const msgs: Message[] = [userImg("shot 1"), userText("hi"), userImg("shot 2"), userText("bye"), userImg("shot 3")];
    const { messages, dropped } = stripHistoricalImages(msgs);
    expect(dropped).toBe(2); // shots 1 & 2 stripped
    expect((messages[0] as { images?: unknown }).images).toBeUndefined();
    expect((messages[2] as { images?: unknown }).images).toBeUndefined();
    expect((messages[4] as { images?: unknown }).images).toEqual([img]); // most recent kept
    // Text is untouched.
    expect(messages[0]?.content).toBe("shot 1");
  });

  it("keepLast=0 strips every image", () => {
    const { dropped, messages } = stripHistoricalImages([userImg("a"), userImg("b")], 0);
    expect(dropped).toBe(2);
    expect(messages.every((m) => !("images" in m && (m as { images?: unknown }).images))).toBe(true);
  });

  it("no images → no-op", () => {
    const msgs = [userText("a"), userText("b")];
    expect(stripHistoricalImages(msgs)).toEqual({ messages: msgs, dropped: 0 });
  });
});

describe("stripAllImages", () => {
  it("strips every image and leaves a breadcrumb on each affected message", () => {
    const { messages, stripped } = stripAllImages([userImg("look"), userText("plain"), userImg("")]);
    expect(stripped).toBe(2);
    expect((messages[0] as { images?: unknown }).images).toBeUndefined();
    expect(messages[0]?.content).toContain("look");
    expect(messages[0]?.content).toContain("image omitted");
    // A message with no prior text still gets the breadcrumb (not empty).
    expect(messages[2]?.content).toContain("image omitted");
    // A text-only message is untouched.
    expect(messages[1]?.content).toBe("plain");
  });

  it("stripped=0 when there are no images (caller skips the retry)", () => {
    const msgs = [userText("a")];
    expect(stripAllImages(msgs)).toEqual({ messages: msgs, stripped: 0 });
  });
});
