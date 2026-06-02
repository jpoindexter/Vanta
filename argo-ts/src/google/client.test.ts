import { describe, it, expect } from "vitest";
import { buildUrl } from "./client.js";

const BASE = "https://www.googleapis.com/gmail/v1/users/me/messages";

describe("buildUrl", () => {
  it("returns the base unchanged when no params object is given", () => {
    expect(buildUrl(BASE)).toBe(BASE);
  });

  it("returns the base unchanged when every param is undefined", () => {
    expect(buildUrl(BASE, { q: undefined, maxResults: undefined })).toBe(BASE);
  });

  it("encodes string params into the query string", () => {
    expect(buildUrl(BASE, { q: "from:bob subject:hi" })).toBe(
      `${BASE}?q=from%3Abob+subject%3Ahi`,
    );
  });

  it("stringifies numeric params", () => {
    expect(buildUrl(BASE, { maxResults: 25 })).toBe(`${BASE}?maxResults=25`);
  });

  it("skips undefined params but keeps defined ones", () => {
    expect(buildUrl(BASE, { q: "test", pageToken: undefined })).toBe(
      `${BASE}?q=test`,
    );
  });

  it("joins multiple defined params", () => {
    expect(buildUrl(BASE, { q: "hi", maxResults: 5 })).toBe(
      `${BASE}?q=hi&maxResults=5`,
    );
  });
});
