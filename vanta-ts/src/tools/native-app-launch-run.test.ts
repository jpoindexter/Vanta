import { describe, expect, it, vi } from "vitest";
import { createNativeAppAdapter } from "./native-app-launch-run.js";

const app = { bundleId: "com.apple.calculator", path: "/System/Applications/Calculator.app" };
const reply = (value: unknown) => ({ stdout: JSON.stringify(value), stderr: "" });

describe("native app process adapter", () => {
  it("resolves through fixed JXA with the bundle ID passed only as an argument", async () => {
    const run = vi.fn(async () => reply(app));
    expect(await createNativeAppAdapter({ run }).resolve(app.bundleId)).toEqual(app);
    expect(run).toHaveBeenCalledWith("/usr/bin/osascript", ["-l", "JavaScript", "-e", expect.stringContaining("URLForApplicationWithBundleIdentifier"), app.bundleId]);
  });

  it("returns null for an unresolved bundle", async () => {
    expect(await createNativeAppAdapter({ run: async () => reply({ found: false }) }).resolve(app.bundleId)).toBeNull();
  });

  it.each([
    { ...app, bundleId: "com.other.app" },
    { ...app, path: "Calculator.app" },
    { ...app, path: "/tmp/document.txt" },
    { ...app, path: "/Applications/../tmp/Calculator.app" },
    { ...app, path: "/tmp/App.app\n--args" },
    { ...app, arguments: ["--args", "unsafe"] },
  ])("rejects unsafe or mismatched lookup metadata: %j", async (value) => {
    await expect(createNativeAppAdapter({ run: async () => reply(value) }).resolve(app.bundleId)).rejects.toThrow();
  });

  it("launches the resolved app path as one operand after the hard separator", async () => {
    const run = vi.fn(async () => ({ stdout: "", stderr: "" }));
    await createNativeAppAdapter({ run }).launch(app);
    expect(run).toHaveBeenCalledExactlyOnceWith("/usr/bin/open", ["--", app.path]);
  });

  it("rejects launch-time unsafe identity before invoking any process", async () => {
    const run = vi.fn();
    await expect(createNativeAppAdapter({ run }).launch({ ...app, path: "--args" })).rejects.toThrow();
    expect(run).not.toHaveBeenCalled();
  });

  it("does not retry a rejected process or ignore an ambiguous diagnostic", async () => {
    const run = vi.fn(async () => { throw new Error("timed out"); });
    await expect(createNativeAppAdapter({ run }).launch(app)).rejects.toThrow("timed out");
    expect(run).toHaveBeenCalledOnce();
    await expect(createNativeAppAdapter({ run: async () => ({ stdout: "", stderr: "launch rejected" }) }).launch(app)).rejects.toThrow();
  });
});
