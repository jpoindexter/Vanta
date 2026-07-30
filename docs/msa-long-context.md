# Memory Sparse Attention Integration

## Product Decision

**Product:** Vanta, a local trusted operator.
**Customer:** Operators with large private corpora who use Vanta and other MCP-capable AI clients.
**Objective:** Make extreme long-context memory available through one governed interface without changing Vanta’s TypeScript/Rust architecture.
**Constraint:** No Python dependency, CUDA library, or model checkpoint is bundled into Vanta.
**Decision owner:** Jason Poindexter.
**Decision:** Ship an optional TypeScript MSA adapter now; require a separate NVIDIA runtime for real inference; consider a native runtime only after live value and parity are proven.

Dominant uncertainty is feasibility and operational value, not whether long-context memory is desirable.

## Evidence and Assumptions

- **Observed:** The official MSA implementation is an end-to-end trained architecture with offline memory encoding, online routing/context assembly, and sparse generation. It is not a drop-in attention kernel.
- **Observed:** Its published quick start uses Python 3.12, PyTorch, FlashAttention, the MSA-4B checkpoint, and NVIDIA hardware.
- **Reported:** The authors report less than 9% degradation from 16K to 100M tokens and 100M-token inference on two A800 GPUs.
- **Inferred:** Vanta should consume MSA as a model service rather than port its implementation into the core application.
- **Assumed:** Operators can provision an authenticated NVIDIA endpoint when they need the capability. This remains unverified until the external proof card passes.

Primary sources: [paper](https://arxiv.org/abs/2603.23516), [official repository](https://github.com/EverMind-AI/MSA), and [MSA-4B checkpoint](https://huggingface.co/EverMind-AI/MSA-4B).

## Architecture

```text
Vanta TypeScript/Rust
  ├─ local brain (durable source of truth)
  ├─ msa_memory tool
  ├─ MemoryProvider adapter
  └─ Vanta MCP server
          │ HTTPS or loopback HTTP
          ▼
Optional MSA runtime on an NVIDIA host
  ├─ offline memory encoding
  ├─ sparse routing
  └─ grounded generation
```

Writes land in the local brain first and are then indexed by MSA. Queries prefer valid MSA hits and fall back to local memory on empty results, timeout, invalid output, or service failure. Hosted OpenAI, Claude, and Gemini models do not acquire MSA attention internally; they can call the shared `msa_memory` capability through Vanta’s MCP server.

## Runtime Contract

The external service implements:

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/v1/health` | Readiness, model, device, and runtime version |
| `POST` | `/v1/memories` | Index bounded text documents |
| `POST` | `/v1/query` | Return scored, cited memory segments |
| `POST` | `/v1/generate` | Generate an answer with cited segments |

All inputs and responses are schema-validated. Returned text is stripped of terminal control bytes. Indexing is limited to 10 MB per document and flat scalar metadata. Request failures are values, not uncaught exceptions.

## Configuration and Use

```bash
export VANTA_MEMORY=msa
export VANTA_MSA_URL=https://msa.example.com
export VANTA_MSA_TOKEN='...'       # optional bearer token
export VANTA_MSA_TIMEOUT_MS=30000  # 1–120 seconds
```

Remote endpoints require HTTPS. Plain HTTP is accepted only for loopback unless `VANTA_MSA_ALLOW_INSECURE_REMOTE=1` is explicitly set.

Vanta actions:

```text
msa_memory { action: "status" }
msa_memory { action: "index", document_id: "manual", content: "..." }
msa_memory { action: "query", query: "...", top_k: 10 }
msa_memory { action: "generate", query: "...", top_k: 10 }
```

Other MCP clients can mount the globally installed `vanta mcp serve`.
`msa_memory` is discoverable by default; every call still passes through
Vanta’s kernel. Indexing external content may require interactive approval and
is therefore refused in a headless MCP call when the kernel returns Ask.

## Scope and Non-goals

In scope:

- TypeScript protocol, client, memory-provider adapter, setup option, and tool.
- Local-first writes, safe failure fallback, MCP exposure, and observable health.
- Loopback contract proof on macOS and a later live NVIDIA proof.

Not in scope for this slice:

- Bundling Python, PyTorch, CUDA, FlashAttention, or model weights in Vanta.
- Replacing Vanta’s default local brain.
- Modifying the internals of hosted model APIs.
- Claiming 100M-token performance from a mock or unit test.
- A native Rust/C++/CUDA implementation before the external runtime proves value.

## Success, Guardrails, and Instrumentation

Focus metric: **successful grounded MSA query rate** — completed query or generation calls with at least one valid cited segment, divided by started calls, per runtime and corpus size.

Supporting measures:

- Index acceptance and rejection counts.
- Query/generation latency p50, p95, and p99.
- Citation coverage and empty-result rate.
- Local-fallback count by terminal reason.
- Authentication, timeout, invalid-response, and drift failures.
- GPU cost per accepted query and throughput at each corpus size.

Guardrails:

- Zero credentials in logs, tool output, persisted traces, or fixtures.
- Zero remote-only memories; local remains authoritative.
- No automatic insecure remote HTTP.
- No release claim until a real checkpoint and NVIDIA host execute the acceptance path.
- Existing public memory-eval recall must not regress when MSA is unconfigured.

Pilot continuation requires: all contract tests pass, loopback proof exercises four endpoints with authentication, unconfigured behavior remains local, and the live NVIDIA run records corpus size, recall quality, TTFT, TPOT, throughput, GPU memory, and cost. Any secret leak or fabricated citation is a stop condition.

## Rollout and Review

1. **Adapter:** ship the Vanta TypeScript boundary and contract proof.
2. **External proof:** deploy the official checkpoint behind the contract on supported NVIDIA hardware and run the real acceptance corpus.
3. **Pilot:** compare MSA against Vanta’s existing memory evaluation and a same-backbone RAG baseline.
4. **Native decision:** revisit a Python-free service port only if the pilot demonstrates material quality or cost value and the custom architecture can be reproduced without unacceptable regression.

Review after the first live NVIDIA receipt or when the official runtime exposes a stable serving API, whichever occurs first.
