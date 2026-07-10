import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./setup.js", () => ({ askLine: vi.fn(async () => ""), askSecret: vi.fn(async () => ""), setEnv: vi.fn(async () => {}) }));
vi.mock("./term/select.js", () => ({ select: vi.fn(async () => 0) }));

import { runSettingSection, SETTINGS } from "./setup-sections.js";
import { askLine, askSecret, setEnv } from "./setup.js";
import { select } from "./term/select.js";

const mSelect = vi.mocked(select);
const mSet = vi.mocked(setEnv);
const mAskSecret = vi.mocked(askSecret);
const mAskLine = vi.mocked(askLine);

const byKey = (k: string) => SETTINGS.find((s) => s.key === k);
const vision = byKey("VANTA_VISION_MODEL")!;
const search = byKey("VANTA_SEARCH_PROVIDER")!;

beforeEach(() => vi.clearAllMocks());

describe("SETTINGS catalog", () => {
  it("covers Vanta's non-trash knobs; no Nous/Spotify/TTS", () => {
    expect(SETTINGS.map((s) => s.key)).toEqual([
      "VANTA_VISION_MODEL", "VANTA_EXEC_BACKEND", "VANTA_SEARCH_PROVIDER", "VANTA_MAX_ITER", "VANTA_MEMORY_MAX_BLOCKS",
      "VANTA_THINKING_BUDGET", "VANTA_AUTO_COMPACT_THRESHOLD", "VANTA_RESUME_MAX_AGE_MIN", "VANTA_TOOL_PROGRESS",
      "VANTA_COMPOSER_ANCHOR", "VANTA_SPINNER",
    ]);
    const blob = JSON.stringify(SETTINGS).toLowerCase();
    expect(blob).not.toContain("nous");
    expect(blob).not.toContain("spotify");
    expect(blob).not.toContain("text-to-speech");
  });
});

describe("runSettingSection", () => {
  it("Esc (−1) writes nothing", async () => {
    mSelect.mockResolvedValue(-1);
    await runSettingSection("/repo", vision);
    expect(mSet).not.toHaveBeenCalled();
  });

  it("a 'keep current' choice (undefined value) writes nothing", async () => {
    mSelect.mockResolvedValue(0); // vision[0] = keep current
    await runSettingSection("/repo", vision);
    expect(mSet).not.toHaveBeenCalled();
  });

  it("a value choice writes that env var", async () => {
    mSelect.mockResolvedValue(1); // vision[1] = gpt-4o-mini
    await runSettingSection("/repo", vision);
    expect(mSet).toHaveBeenCalledWith("/repo", { VANTA_VISION_MODEL: "gpt-4o-mini" });
  });

  it("a key-requiring choice collects the secret too", async () => {
    mSelect.mockResolvedValue(2); // search[2] = serpapi (keyEnv SERPAPI_KEY)
    mAskSecret.mockResolvedValue("sk-serp");
    await runSettingSection("/repo", search);
    expect(mSet).toHaveBeenCalledWith("/repo", { VANTA_SEARCH_PROVIDER: "serpapi", SERPAPI_KEY: "sk-serp" });
  });

  it("the custom option writes a typed value", async () => {
    mSelect.mockResolvedValue(4); // vision: 4 choices + custom → custom index = 4
    mAskLine.mockResolvedValue("my-vision-model");
    await runSettingSection("/repo", vision);
    expect(mSet).toHaveBeenCalledWith("/repo", { VANTA_VISION_MODEL: "my-vision-model" });
  });

  it("the execution-backend local choice writes a multi-key env (backend + sandbox off)", async () => {
    mSelect.mockResolvedValue(0); // backend[0] = local
    await runSettingSection("/repo", byKey("VANTA_EXEC_BACKEND")!);
    expect(mSet).toHaveBeenCalledWith("/repo", { VANTA_EXEC_BACKEND: "local", VANTA_SANDBOX: "0" });
  });

  it("the execution-backend sandbox choice enables VANTA_SANDBOX", async () => {
    mSelect.mockResolvedValue(1); // backend[1] = sandbox
    await runSettingSection("/repo", byKey("VANTA_EXEC_BACKEND")!);
    expect(mSet).toHaveBeenCalledWith("/repo", { VANTA_EXEC_BACKEND: "local", VANTA_SANDBOX: "1" });
  });

  it("the execution-backend docker choice sets docker and collects an optional image", async () => {
    mSelect.mockResolvedValue(2); // backend[2] = docker
    mAskLine.mockResolvedValue("python:3.12-slim");
    await runSettingSection("/repo", byKey("VANTA_EXEC_BACKEND")!);
    expect(mSet).toHaveBeenCalledWith("/repo", { VANTA_EXEC_BACKEND: "docker", VANTA_SANDBOX: "0", VANTA_DOCKER_IMAGE: "python:3.12-slim" });
  });

  it("the execution-backend Modal choice is explicit, remote, and opt-in", async () => {
    mSelect.mockResolvedValue(3); // backend[3] = Modal
    mAskLine.mockResolvedValue("worker.py");
    await runSettingSection("/repo", byKey("VANTA_EXEC_BACKEND")!);
    expect(mSet).toHaveBeenCalledWith("/repo", {
      VANTA_EXEC_BACKEND: "serverless",
      VANTA_SERVERLESS_PROVIDER: "modal",
      VANTA_SERVERLESS_NET: "0",
      VANTA_SANDBOX: "0",
      VANTA_SERVERLESS_APP: "worker.py",
    });
  });

  it("the execution-backend Daytona choice selects the sibling adapter", async () => {
    mSelect.mockResolvedValue(4); // backend[4] = Daytona
    mAskLine.mockResolvedValue("");
    await runSettingSection("/repo", byKey("VANTA_EXEC_BACKEND")!);
    expect(mSet).toHaveBeenCalledWith("/repo", {
      VANTA_EXEC_BACKEND: "serverless",
      VANTA_SERVERLESS_PROVIDER: "daytona",
      VANTA_SERVERLESS_NET: "0",
      VANTA_SANDBOX: "0",
    });
  });

  it("an agent-knob section (tool-progress) writes its value", async () => {
    mSelect.mockResolvedValue(2); // tool-progress[2] = off
    await runSettingSection("/repo", byKey("VANTA_TOOL_PROGRESS")!);
    expect(mSet).toHaveBeenCalledWith("/repo", { VANTA_TOOL_PROGRESS: "off" });
  });

  it("a custom agent-knob (thinking budget) writes the typed value", async () => {
    const tb = byKey("VANTA_THINKING_BUDGET")!;
    mSelect.mockResolvedValue(tb.choices.length); // custom index = after the 3 choices
    mAskLine.mockResolvedValue("6000");
    await runSettingSection("/repo", tb);
    expect(mSet).toHaveBeenCalledWith("/repo", { VANTA_THINKING_BUDGET: "6000" });
  });
});
