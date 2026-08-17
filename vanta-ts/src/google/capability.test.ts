import { describe, expect, it } from "vitest";
import { googleScopesFor, googleServiceForUrl } from "./capability.js";

describe("Google capability boundaries", () => {
  it("requests exactly one independently revocable scope", () => {
    expect(googleScopesFor("gmail")).toEqual(["https://www.googleapis.com/auth/gmail.modify"]);
    expect(googleScopesFor("calendar")).toEqual(["https://www.googleapis.com/auth/calendar"]);
    expect(googleScopesFor("drive")).toEqual(["https://www.googleapis.com/auth/drive"]);
  });

  it("binds ordinary and upload URLs to the correct service", () => {
    expect(googleServiceForUrl("https://gmail.googleapis.com/gmail/v1/users/me/messages")).toBe("gmail");
    expect(googleServiceForUrl("https://www.googleapis.com/calendar/v3/calendars/primary/events")).toBe("calendar");
    expect(googleServiceForUrl("https://www.googleapis.com/drive/v3/files")).toBe("drive");
    expect(googleServiceForUrl("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart")).toBe("drive");
    expect(() => googleServiceForUrl("https://www.googleapis.com/oauth2/v1/userinfo")).toThrow(/not bound/);
  });
});
