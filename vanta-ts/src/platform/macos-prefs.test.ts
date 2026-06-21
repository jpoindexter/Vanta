import { describe, it, expect } from "vitest";
import { privacyPaneUrl, openPrivacyPane } from "./macos-prefs.js";

describe("privacyPaneUrl", () => {
  it("builds the right deep link per pane", () => {
    expect(privacyPaneUrl("microphone")).toContain("Privacy_Microphone");
    expect(privacyPaneUrl("screen-recording")).toContain("Privacy_ScreenCapture");
    expect(privacyPaneUrl("accessibility")).toContain("Privacy_Accessibility");
    expect(privacyPaneUrl("microphone")).toMatch(/^x-apple\.systempreferences:/);
  });
});

describe("openPrivacyPane", () => {
  it("on macOS → spawns open with the pane url, ok:true", () => {
    let opened = "";
    const res = openPrivacyPane("microphone", { open: (u) => (opened = u), platform: "darwin" });
    expect(res.ok).toBe(true);
    expect(opened).toContain("Privacy_Microphone");
    expect(res.message).toMatch(/Microphone|microphone/);
  });
  it("off macOS → ok:false with a manual-path message, never spawns", () => {
    let opened = "";
    const res = openPrivacyPane("screen-recording", { open: (u) => (opened = u), platform: "linux" });
    expect(res.ok).toBe(false);
    expect(opened).toBe("");
    expect(res.message).toMatch(/macOS-only|manually/);
  });
});
