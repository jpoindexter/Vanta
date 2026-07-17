import { describe, expect, it } from "vitest";
import { runtimeLaunchPreview } from "./profiles.js";
import type { RuntimeEngineBackend, RuntimeLaunchSpec } from "./types.js";

const gib = 1024 ** 3;
function spec(backend: RuntimeEngineBackend): RuntimeLaunchSpec {
  return { id: `${backend}-runtime`, backend, model: "/models/qwen.gguf", host: "127.0.0.1", port: 8181, contextTokens: 8192, modelBytes: 8 * gib, availableMemoryBytes: 24 * gib, retainOnFailure: false };
}

describe("runtime engine launch profiles", () => {
  it("previews exact MLX and llama.cpp commands with resource fit before launch", () => {
    expect(runtimeLaunchPreview(spec("mlx"))).toMatchObject({ command: "python3", args: ["-m", "mlx_lm.server", "--model", "/models/qwen.gguf", "--host", "127.0.0.1", "--port", "8181"], location: "local", support: "supported", resource: { fits: true } });
    expect(runtimeLaunchPreview(spec("llama_cpp"))).toMatchObject({ command: "llama-server", args: ["--model", "/models/qwen.gguf", "--host", "127.0.0.1", "--port", "8181", "--ctx-size", "8192"], location: "local", support: "supported" });
  });

  it("keeps vLLM and SGLang contract-only until a remote transport is live-proven", () => {
    expect(runtimeLaunchPreview(spec("vllm"))).toMatchObject({ command: "python3", args: expect.arrayContaining(["vllm.entrypoints.openai.api_server"]), location: "remote", support: "contract_only" });
    expect(runtimeLaunchPreview(spec("sglang"))).toMatchObject({ command: "python3", args: expect.arrayContaining(["sglang.launch_server"]), location: "remote", support: "contract_only" });
  });

  it("reports a resource overflow instead of silently attempting launch", () => {
    expect(runtimeLaunchPreview({ ...spec("llama_cpp"), availableMemoryBytes: gib }).resource).toMatchObject({ fits: false, headroomBytes: expect.any(Number) });
  });
});
